import { useState, useRef } from "react";
import { extractMarkdown, Provider, ExtractionResult } from "../lib/api";
import { logger } from "../lib/logger";
import { blobToBase64, renderPageFromDoc } from "../lib/pdfUtils";
import { cacheDB, STORES } from "../lib/cache";
import { updateStats } from "../lib/utils/stats";
import {
  uploadToSupabase,
  getSignedUrl,
  deleteFromSupabase,
  calculateAdaptiveTTL,
} from "../lib/supabase";
import type {
  AppFile,
  AppConfig,
  BatchProgress,
  PageCache,
} from "../lib/utils/types";

export interface ExtractionDeps {
  file: AppFile | null;
  previewUrl: string | null;
  currentPdfPage: number;
  markdown: string;
  config: AppConfig | null;
  pdfDoc: any;
  pageCache: PageCache;
  thumbCache: PageCache;
  setMarkdown: (val: string | ((prev: string) => string)) => void;
  setMarkdownCache: (fn: (prev: Record<number, string>) => Record<number, string>) => void;
  setPageCache: (fn: (prev: Record<number, string>) => Record<number, string>) => void;
  setCurrentPdfPage: (pageNum: number) => void;
  setErrorMsg: (msg: string | null) => void;
}

export function useExtraction(deps: ExtractionDeps) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPageExtracting, setIsPageExtracting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [usage, setUsage] = useState<ExtractionResult["usage"] | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [extractDuration, setExtractDuration] = useState<number | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    current: 0,
    total: 0,
    status: "",
  });
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const stopBatchRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingTimerRef = useRef<number | null>(null);

  const updateStreamingActivity = (active: boolean) => {
    if (!active) {
      setIsStreaming(false);
      if (streamingTimerRef.current) window.clearTimeout(streamingTimerRef.current);
      return;
    }

    setIsStreaming(true);
    if (streamingTimerRef.current) window.clearTimeout(streamingTimerRef.current);
    streamingTimerRef.current = window.setTimeout(() => {
      setIsStreaming(false);
    }, 1000); // Set to false if no chunk for 1s
  };

  const handleCancel = () => {
    console.log("[Extractor] Cancellation requested...");
    stopBatchRef.current = true;
    if (abortControllerRef.current) {
      logger.warn("[Extractor] Aborting current request...");
      abortControllerRef.current.abort();
    }
  };

  const handleExtract = async () => {
    if (!deps.previewUrl) {
      console.warn("[Extractor] Cannot extract: previewUrl is empty");
      return;
    }

    setIsExtracting(true);
    deps.setErrorMsg(null);
    setExtractDuration(null);

    try {
      setIsPageExtracting(true);
      abortControllerRef.current = new AbortController();
      const savedSettings = localStorage.getItem("pustakaku-settings");
      if (!savedSettings) {
        throw new Error("Please configure your API settings first.");
      }

      const config = JSON.parse(savedSettings);
      
      // Resolve correct model (mirrors benchmark logic)
      const modelToUse = 
        (config.provider === "google" && config.googleModel) ||
        (config.provider === "openrouter" && config.openRouterModel) ||
        (config.provider === "anthropic" && config.anthropicModel) ||
        (config.provider === "ollama" && config.ollamaModel) ||
        config.selectedModel;

      if (!config.provider || !modelToUse) {
        throw new Error("Incomplete API configuration. Please check your settings.");
      }

      logger.info(`Extracting page ${deps.currentPdfPage}...`);

      const blob: Blob = deps.previewUrl.startsWith("data:")
        ? await fetch(deps.previewUrl).then((r) => r.blob())
        : await fetch(deps.previewUrl).then((r) => {
            if (!r.ok) throw new Error(`Failed to fetch preview image: ${r.statusText}`);
            return r.blob();
          });

      deps.setMarkdown("");
      updateStreamingActivity(true);
      
      const startTime = performance.now(); // Start timing AFTER render is finished

      const useSupabase =
        config.provider === "openrouter" &&
        config.imageInputMode === "supabase" &&
        !!config.supabaseProjectId &&
        !!config.supabaseServiceKey;

      const supabaseConfig = useSupabase
        ? {
            url: `https://${config.supabaseProjectId}.supabase.co`,
            serviceKey: config.supabaseServiceKey!,
            bucket: config.supabaseBucket || "page-images",
          }
        : null;

      let uploadedPath: string | null = null;

      try {
        let extractionImageUrl: string | undefined;

        if (useSupabase && supabaseConfig) {
          const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const filePath = `page-${deps.currentPdfPage}-${sessionId}.jpg`;
          const ttl = calculateAdaptiveTTL(1);

          uploadedPath = await uploadToSupabase(blob, supabaseConfig, filePath);
          extractionImageUrl = await getSignedUrl(uploadedPath, supabaseConfig, ttl);
          logger.info(`[Supabase] Image ready for extraction`, { url: extractionImageUrl.split('?')[0] });
        }

        const base64 = useSupabase ? "" : await blobToBase64(blob);

        const result = await extractMarkdown({
          provider: config.provider as Provider,
          openRouterKey: config.openRouterKey,
          ollamaUrl: config.ollamaUrl,
          googleApiKey: config.googleApiKey,
          model: modelToUse,
          base64Image: base64,
          imageInputMode: useSupabase ? "supabase" : (config.imageInputMode === "google_files" ? "google_files" : "base64"),
          imageUrl: extractionImageUrl,
          onChunk: (chunk) => {
            deps.setMarkdown((prev) => (typeof prev === "string" ? prev + chunk : chunk));
            updateStreamingActivity(true);
          },
          signal: abortControllerRef.current.signal,
        });

        updateStreamingActivity(false);
        const duration = (performance.now() - startTime) / 1000;
        setExtractDuration(duration);

        deps.setMarkdown(result.markdown);
        deps.setMarkdownCache((prev) => {
          const next = { ...prev, [deps.currentPdfPage]: result.markdown };
          if (deps.file) {
            cacheDB.set(
              STORES.EXTRACTIONS,
              { path: deps.file.path, pageNum: deps.currentPdfPage },
              result.markdown
            );
          }
          return next;
        });
        setUsage(result.usage);
        setCost(result.cost ?? null);
        updateStats(result, deps.file?.path || "", deps.file?.name || "unknown", duration);
      } finally {
        // Always clean up the uploaded file, even if extraction fails
        if (uploadedPath && supabaseConfig) {
          await deleteFromSupabase(uploadedPath, supabaseConfig).catch((e) => {
            logger.warn(`[Supabase] Cleanup failed for ${uploadedPath}`, { error: String(e) });
          });
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        logger.warn(`Extraction of page ${deps.currentPdfPage} cancelled.`);
        return;
      }
      logger.error(`Extraction failed for page ${deps.currentPdfPage}`, { error: e.message || e });
      deps.setErrorMsg(
        e instanceof Error ? e.message : String(e) || "An unknown error occurred."
      );
    } finally {
      abortControllerRef.current = null;
      setIsExtracting(false);
      setIsPageExtracting(false);
      updateStreamingActivity(false);
    }
  };

  const handleBatchExtract = async () => {
    if (selectedPages.size === 0) return;

    setIsBatchProcessing(true);
    
    // Save current markdown before switching pages
    if (deps.markdown) {
      deps.setMarkdownCache((prev) => ({ ...prev, [deps.currentPdfPage]: deps.markdown }));
    }

    setBatchProgress({
      current: 0,
      total: selectedPages.size,
      status: "Starting batch job...",
      currentImage: undefined,
      currentPage: undefined,
    });
    stopBatchRef.current = false;
    abortControllerRef.current = new AbortController();
    logger.info(`Starting batch extraction of ${selectedPages.size} pages`);

    const pageList = Array.from(selectedPages).sort((a, b) => a - b);

    try {
      const savedSettings = localStorage.getItem("pustakaku-settings");
      if (!savedSettings) throw new Error("Please configure API settings first.");
      const config = JSON.parse(savedSettings);

      const concurrency = config.batchMode === "parallel" ? (config.batchConcurrency || 3) : 1;
      const isParallel = config.batchMode === "parallel";

      // Helper to process a single page
      const processPageTask = async (pageNum: number, index: number) => {
        if (stopBatchRef.current || abortControllerRef.current?.signal.aborted) {
          setBatchProgress(prev => ({ ...prev, current: prev.current + 1 }));
          return;
        }

        try {
          setBatchProgress((prev) => ({
            ...prev,
            status: isParallel 
              ? `Processing ${prev.activePages?.length || 1} pages...`
              : `Page ${index + 1} of ${pageList.length} — rendering pg. ${pageNum}...`,
            currentPage: isParallel ? prev.currentPage : pageNum,
            currentImage: isParallel ? prev.currentImage : (deps.pageCache[pageNum] || deps.thumbCache[pageNum]),
          }));

          if (!isParallel) {
            deps.setCurrentPdfPage(pageNum);
            deps.setMarkdown("");
          }

          let blobUrl = deps.pageCache[pageNum];
          let currentBlob: Blob;

          if (!blobUrl) {
            const { promise } = renderPageFromDoc(deps.pdfDoc, pageNum);
            const { blob } = await promise;
            currentBlob = blob;
            blobUrl = URL.createObjectURL(blob);
            deps.setPageCache((prev) => {
              const next = { ...prev, [pageNum]: blobUrl };
              if (deps.file)
                cacheDB.set(STORES.PAGE_RENDERS, { path: deps.file.path, pageNum }, blob);
              return next;
            });
          } else {
            currentBlob = await fetch(blobUrl).then((r) => r.blob());
          }

          if (!isParallel) {
            setBatchProgress((prev) => ({
              ...prev,
              currentImage: blobUrl,
              status: `Page ${index + 1} of ${pageList.length} — extracting pg. ${pageNum}...`,
            }));
          }

          const modelToUse = 
            (config.provider === "google" && config.googleModel) ||
            (config.provider === "openrouter" && config.openRouterModel) ||
            (config.provider === "anthropic" && config.anthropicModel) ||
            (config.provider === "ollama" && config.ollamaModel) ||
            config.selectedModel;

          const startTime = performance.now();
          const useSupabase =
            config.provider === "openrouter" &&
            config.imageInputMode === "supabase" &&
            !!config.supabaseProjectId &&
            !!config.supabaseServiceKey;

          const supabaseConfig = useSupabase
            ? {
                url: `https://${config.supabaseProjectId}.supabase.co`,
                serviceKey: config.supabaseServiceKey!,
                bucket: config.supabaseBucket || "page-images",
              }
            : null;

          let uploadedPath: string | null = null;

          try {
            if (!isParallel) setIsPageExtracting(true);
            updateStreamingActivity(true);

            let extractionImageUrl: string | undefined;

            if (useSupabase && supabaseConfig) {
              const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              const filePath = `page-${pageNum}-${sessionId}.jpg`;
              const remainingPages = pageList.length - index;
              const ttl = calculateAdaptiveTTL(remainingPages);

              uploadedPath = await uploadToSupabase(currentBlob, supabaseConfig, filePath);
              extractionImageUrl = await getSignedUrl(uploadedPath, supabaseConfig, ttl);
              logger.info(`[Supabase] Image ready for extraction (Page ${pageNum})`, { url: extractionImageUrl.split('?')[0] });
            }

          const base64 = useSupabase ? "" : await blobToBase64(currentBlob);

          const result = await extractMarkdown({
            provider: config.provider as Provider,
            openRouterKey: config.openRouterKey,
            ollamaUrl: config.ollamaUrl,
            googleApiKey: config.googleApiKey,
            model: modelToUse,
            base64Image: base64,
            imageInputMode: useSupabase ? "supabase" : (config.imageInputMode === "google_files" ? "google_files" : "base64"),
            imageUrl: extractionImageUrl,
            onChunk: (chunk) => {
              if (!isParallel) {
                deps.setMarkdown((prev) => (typeof prev === "string" ? prev + chunk : chunk));
                updateStreamingActivity(true);
              }
            },
            signal: abortControllerRef.current?.signal,
          });

          const duration = (performance.now() - startTime) / 1000;
          deps.setMarkdownCache((prev) => {
            const next = { ...prev, [pageNum]: result.markdown };
            if (deps.file)
              cacheDB.set(
                STORES.EXTRACTIONS,
                { path: deps.file.path, pageNum },
                result.markdown
              );
            return next;
          });
          updateStats(result, deps.file?.path || "", deps.file?.name || "unknown", duration);

          if (!isParallel) {
            deps.setMarkdown(result.markdown);
            setUsage(result.usage);
            setCost(result.cost ?? null);
            setExtractDuration(duration);
          }
        } finally {
          if (!isParallel) setIsPageExtracting(false);
          updateStreamingActivity(false);
          if (uploadedPath && supabaseConfig) {
            await deleteFromSupabase(uploadedPath, supabaseConfig).catch((e) => {
              logger.warn(`[Supabase] Cleanup failed for ${uploadedPath} (Batch pg. ${pageNum})`, { error: String(e) });
            });
          }
        }
      } catch (e: any) {
        if (e.name === "AbortError") {
          logger.warn(`Extraction of page ${pageNum} stopped.`);
        } else {
          logger.error(`Failed on page ${pageNum}`, { error: e.message || e });
        }
      }
    };

    const activePages = new Set<number>();
    const tasks = [...pageList];
    let completedCount = 0;

    const worker = async () => {
      while (tasks.length > 0 && !stopBatchRef.current) {
        const pageNum = tasks.shift()!;
        const index = pageList.indexOf(pageNum);
        activePages.add(pageNum);
        
        setBatchProgress(prev => ({ 
          ...prev, 
          activePages: Array.from(activePages),
          status: isParallel ? `Processing ${activePages.size} pages...` : prev.status 
        }));

        await processPageTask(pageNum, index);
        
        activePages.delete(pageNum);
        completedCount++;
        setBatchProgress(prev => ({ 
          ...prev, 
          current: completedCount,
          activePages: Array.from(activePages) 
        }));
      }
    };

    // Run workers based on concurrency
    const workers = Array.from({ length: Math.min(concurrency, pageList.length) }, () => worker());
    await Promise.all(workers);
    } catch (e: any) {
      if (e.name === "AbortError") {
        console.log("[Extractor] Batch process aborted.");
      } else {
        deps.setErrorMsg(`Batch extraction failed: ${e.message}`);
      }
    } finally {
      abortControllerRef.current = null;
      setIsBatchProcessing(false);
      updateStreamingActivity(false);
      logger.success("Batch extraction completed");
      setSelectedPages(new Set());
    }
  };

  const togglePageSelection = (pageNum: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const selectAllPages = (totalPages: number) => {
    const all = new Set<number>();
    for (let i = 1; i <= totalPages; i++) all.add(i);
    setSelectedPages(all);
  };

  const selectUnextractedPages = (
    totalPages: number,
    cache: Record<number, string>
  ) => {
    const unextracted = new Set<number>();
    for (let i = 1; i <= totalPages; i++) {
      if (!cache[i]) unextracted.add(i);
    }
    setSelectedPages(unextracted);
  };

  return {
    isExtracting,
    isPageExtracting,
    isStreaming,
    usage,
    setUsage,
    cost,
    setCost,
    extractDuration,
    setExtractDuration,
    isBatchProcessing,
    batchProgress,
    selectedPages,
    setSelectedPages,
    stopBatchRef,
    handleExtract,
    handleBatchExtract,
    handleCancel,
    togglePageSelection,
    selectAllPages,
    selectUnextractedPages,
  };
}
