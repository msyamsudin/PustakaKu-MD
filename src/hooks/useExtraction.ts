import { useState, useRef } from "react";
import { extractMarkdown, Provider, ExtractionResult } from "../lib/api";
import { logger } from "../lib/logger";
import { blobToBase64, postProcessImageCrops, renderPageFromDoc } from "../lib/pdfUtils";
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
      if (!config.provider || !config.selectedModel) {
        throw new Error("Incomplete API configuration. Please check your settings.");
      }

      const startTime = performance.now();
      logger.info(`Extracting page ${deps.currentPdfPage}...`);

      const blob: Blob = deps.previewUrl.startsWith("data:")
        ? await fetch(deps.previewUrl).then((r) => r.blob())
        : await fetch(deps.previewUrl).then((r) => {
            if (!r.ok) throw new Error(`Failed to fetch preview image: ${r.statusText}`);
            return r.blob();
          });

      deps.setMarkdown("");
      updateStreamingActivity(true);

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
          model: config.selectedModel,
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

        const processedMarkdown = await postProcessImageCrops(
          result.markdown,
          deps.currentPdfPage
        );

        deps.setMarkdown(processedMarkdown);
        deps.setMarkdownCache((prev) => {
          const next = { ...prev, [deps.currentPdfPage]: processedMarkdown };
          if (deps.file) {
            cacheDB.set(
              STORES.EXTRACTIONS,
              { path: deps.file.path, pageNum: deps.currentPdfPage },
              processedMarkdown
            );
          }
          return next;
        });
        setUsage(result.usage);
        updateStats(result, deps.file?.name || "unknown", duration);
      } finally {
        // Always clean up the uploaded file, even if extraction fails
        if (uploadedPath && supabaseConfig) {
          await deleteFromSupabase(uploadedPath, supabaseConfig);
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

      let currentRenderPromise: Promise<Blob> | null =
        deps.pdfDoc && !deps.pageCache[pageList[0]]
          ? renderPageFromDoc(deps.pdfDoc, pageList[0]).promise
          : null;

      for (let i = 0; i < pageList.length; i++) {
        if (stopBatchRef.current || abortControllerRef.current?.signal.aborted) break;

        const pageNum = pageList[i];
        const nextPageNum = pageList[i + 1];

        setBatchProgress((prev) => ({
          ...prev,
          status: `Page ${i + 1} of ${pageList.length} — rendering pg. ${pageNum}...`,
          currentPage: pageNum,
          currentImage: deps.pageCache[pageNum] || deps.thumbCache[pageNum],
        }));

        // Switch the UI to the page being extracted
        deps.setCurrentPdfPage(pageNum);
        deps.setMarkdown(""); // Clear view for new streaming content

        try {
          let blobUrl = deps.pageCache[pageNum];
          let currentBlob: Blob;

          if (!blobUrl) {
            const blob = await (currentRenderPromise ??
              renderPageFromDoc(deps.pdfDoc, pageNum).promise);
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

          setBatchProgress((prev) => ({
            ...prev,
            currentImage: blobUrl,
            status: `Page ${i + 1} of ${pageList.length} — extracting pg. ${pageNum}...`,
          }));

          // Start rendering the next page NOW (look-ahead)
          if (nextPageNum !== undefined && !deps.pageCache[nextPageNum]) {
            currentRenderPromise = renderPageFromDoc(deps.pdfDoc, nextPageNum).promise;
          } else {
            currentRenderPromise = null;
          }

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
            setIsPageExtracting(true);
            updateStreamingActivity(true);

            let extractionImageUrl: string | undefined;

            if (useSupabase && supabaseConfig) {
              const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              const filePath = `page-${pageNum}-${sessionId}.jpg`;
              // Use adaptive TTL based on remaining pages to process
              const remainingPages = pageList.length - i;
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
              model: config.selectedModel,
              base64Image: base64,
              imageInputMode: useSupabase ? "supabase" : (config.imageInputMode === "google_files" ? "google_files" : "base64"),
              imageUrl: extractionImageUrl,
              onChunk: (chunk) => {
                deps.setMarkdown((prev) => (typeof prev === "string" ? prev + chunk : chunk));
                updateStreamingActivity(true);
              },
              signal: abortControllerRef.current?.signal,
            });

            const duration = (performance.now() - startTime) / 1000;
            const processedMarkdown = await postProcessImageCrops(result.markdown, pageNum);

            deps.setMarkdownCache((prev) => {
              const next = { ...prev, [pageNum]: processedMarkdown };
              if (deps.file)
                cacheDB.set(
                  STORES.EXTRACTIONS,
                  { path: deps.file.path, pageNum },
                  processedMarkdown
                );
              return next;
            });
            updateStats(result, deps.file?.name || "unknown", duration);

            deps.setMarkdown(processedMarkdown);
            setUsage(result.usage);
            setExtractDuration(duration);
          } finally {
            setIsPageExtracting(false);
            updateStreamingActivity(false);
            // Always clean up the uploaded file
            if (uploadedPath && supabaseConfig) {
              await deleteFromSupabase(uploadedPath, supabaseConfig);
            }
          }

          setBatchProgress((prev) => ({ ...prev, current: i + 1 }));
        } catch (e: any) {
          if (e.name === "AbortError") {
            logger.warn(`Batch extraction stopped at page ${pageNum}`);
            break;
          }
          logger.error(`Batch failed on page ${pageNum}`, { error: e.message || e });
          setBatchProgress((prev) => ({ ...prev, current: i + 1 }));
        }
      }
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
