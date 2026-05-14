import { useState, useRef, useCallback } from "react";
import { extractMarkdown } from "../lib/api";
import { logger } from "../lib/logger";
import { renderPageFromDoc, loadPdfDocument, blobToBase64 } from "../lib/pdfUtils";
import {
  uploadToSupabase,
  getSignedUrl,
  deleteFromSupabase,
  calculateAdaptiveTTL,
} from "../lib/supabase";
import type {
  BenchmarkScenario,
  BenchmarkResult,
  BenchmarkPageResult,
  BenchmarkStatus,
} from "../lib/utils/types";

const COOLDOWN_MS = 2000;
const STAGGER_MS = 200;

// ── Settings helpers ──────────────────────────────────────────────────────────

/** Parsed settings from localStorage, or empty object. */
function getConfig(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem("pustakaku-settings") || "{}");
  } catch {
    return {};
  }
}

/** Returns { valid, reason } for a given scenario vs the current saved settings. */
export function verifyScenario(
  scenario: BenchmarkScenario
): { valid: boolean; reason?: string } {
  const cfg = getConfig();

  if (scenario.provider === "google") {
    if (!cfg.googleApiKey?.trim()) {
      return { valid: false, reason: "Google API Key not configured in Settings." };
    }
  }

  if (scenario.provider === "anthropic") {
    if (!cfg.anthropicApiKey?.trim()) {
      return { valid: false, reason: "Anthropic API Key not configured in Settings." };
    }
  }

  if (scenario.provider === "ollama") {
    if (!cfg.ollamaModel?.trim() && !cfg.selectedModel?.trim()) {
      return { valid: false, reason: "Ollama model not configured in Settings." };
    }
    return { valid: true };
  }

  if (scenario.provider === "openrouter") {
    if (!cfg.openRouterKey?.trim()) {
      return { valid: false, reason: "OpenRouter API Key not configured in Settings." };
    }
    if (!cfg.openRouterModel?.trim() && !cfg.selectedModel?.trim()) {
      return { valid: false, reason: "OpenRouter model not configured." };
    }
    if (scenario.imageInputMode === "supabase") {
      if (!cfg.supabaseProjectId?.trim()) {
        return { valid: false, reason: "Supabase Project ID not configured." };
      }
      if (!cfg.supabaseServiceKey?.trim()) {
        return { valid: false, reason: "Supabase Service Key not configured." };
      }
    }
  }

  // Final: ensure at least one resolvable model exists for this provider
  // (mirrors the model resolution logic in runBenchmark)
  const resolvedModel =
    (scenario.provider === "google" && cfg.googleModel?.trim()) ||
    (scenario.provider === "openrouter" && cfg.openRouterModel?.trim()) ||
    (scenario.provider === "anthropic" && cfg.anthropicModel?.trim()) ||
    cfg.selectedModel?.trim();

  if (!resolvedModel) {
    return { valid: false, reason: "No model selected in Settings." };
  }

  return { valid: true };
}

// ── Cost estimation ───────────────────────────────────────────────────────────

function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseBenchmarkReturn {
  results: BenchmarkResult[];
  isRunning: boolean;
  runBenchmark: (
    pdfFile: File,
    pageNums: number[],
    scenarios: BenchmarkScenario[],
    options?: { isParallel?: boolean }
  ) => Promise<void>;
  stopBenchmark: () => void;
  resetResults: () => void;
}

export function useBenchmark(): UseBenchmarkReturn {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const stopBenchmark = useCallback(() => {
    stopRef.current = true;
    abortRef.current?.abort();
  }, []);

  const resetResults = useCallback(() => setResults([]), []);

  const patchResult = (id: string, patch: Partial<BenchmarkResult>) => {
    setResults((prev) =>
      prev.map((r) => (r.scenarioId === id ? { ...r, ...patch } : r))
    );
  };

  const runBenchmark = useCallback(
    async (pdfFile: File, pageNums: number[], scenarios: BenchmarkScenario[], options?: { isParallel?: boolean }) => {
      if (isRunning || pageNums.length === 0 || scenarios.length === 0) return;

      stopRef.current = false;
      setIsRunning(true);

      // Initialise results
      setResults(
        scenarios.map((s) => ({
          scenarioId: s.id,
          label: s.label,
          status: "pending",
          isParallel: options?.isParallel,
          pagesProcessed: 0,
          pagesFailed: 0,
          pageResults: [],
        }))
      );

      const cfg = getConfig();
      logger.info(`[Benchmark] Starting benchmark session`, {
        file: pdfFile.name,
        pages: pageNums.length,
        scenarios: scenarios.length,
        model: cfg.selectedModel
      });

      // Load the PDF once; reuse across all scenarios
      let pdfDoc: Awaited<ReturnType<typeof loadPdfDocument>>;
      try {
        logger.debug(`[Benchmark] Loading PDF document...`);
        pdfDoc = await loadPdfDocument(pdfFile);
        logger.debug(`[Benchmark] PDF loaded successfully.`);
      } catch (err: any) {
        logger.error(`[Benchmark] Failed to load PDF`, { error: err.message });
        setIsRunning(false);
        return;
      }

      try {
        for (let si = 0; si < scenarios.length; si++) {
          if (stopRef.current) {
            setResults((prev) =>
              prev.map((r) =>
                r.status === "pending" ? { ...r, status: "skipped" } : r
              )
            );
            break;
          }

          const scenario = scenarios[si];
          logger.info(`[Benchmark] Starting Scenario ${si + 1}/${scenarios.length}: ${scenario.label}`);

          // ── Verify credentials before starting ───────────────────────────
          const { valid, reason } = verifyScenario(scenario);
          if (!valid) {
            logger.warn(`[Benchmark] Skipping scenario ${scenario.label}: ${reason}`);
            patchResult(scenario.id, {
              status: "skipped",
              errorMessage: reason,
            });
            continue;
          }

          patchResult(scenario.id, { status: "running" });
          abortRef.current = new AbortController();

          const supabaseConfig =
            scenario.imageInputMode === "supabase"
              ? {
                  url: `https://${cfg.supabaseProjectId}.supabase.co`,
                  serviceKey: cfg.supabaseServiceKey,
                  bucket: cfg.supabaseBucket || "page-images",
                }
              : null;

          // Accumulators
          const pageResults: BenchmarkPageResult[] = [];
          let firstPageStartMs: number | undefined;
          let lastPageEndMs: number | undefined;
          const scenarioStart = performance.now();

          // Determine the correct model for this provider (fixed per scenario)
          let modelToUse = cfg.selectedModel;
          if (scenario.provider === "google" && cfg.googleModel) modelToUse = cfg.googleModel;
          else if (scenario.provider === "openrouter" && cfg.openRouterModel) modelToUse = cfg.openRouterModel;
          else if (scenario.provider === "anthropic" && cfg.anthropicModel) modelToUse = cfg.anthropicModel;
          else if (scenario.provider === "ollama" && cfg.ollamaModel) modelToUse = cfg.ollamaModel;

          const processPage = async (pi: number) => {
            if (stopRef.current || abortRef.current?.signal.aborted) {
              // Record skipped page so pagesProcessed + pagesFailed + skipped = total
              pageResults.push({ pageNum: pageNums[pi], errorMessage: "Stopped by user." });
              return;
            }

            const pageNum = pageNums[pi];
            const pageResult: BenchmarkPageResult = { pageNum };
            logger.debug(`[Benchmark] ${scenario.label} - Processing page ${pageNum} (${pi + 1}/${pageNums.length})`);

            try {
              // ── Render page ─────────────────────────────────────────────
              patchResult(scenario.id, { currentTask: `Rendering pg. ${pageNum}...`, taskStartTime: performance.now() });
              const renderStart = performance.now();
              const { promise: renderPromise } = renderPageFromDoc(pdfDoc, pageNum);
              const { blob: pageBlob, width, height } = await renderPromise;
              pageResult.width = width;
              pageResult.height = height;
              const mimeType = pageBlob.type || "image/webp";
              logger.debug(`[Benchmark] Rendered pg. ${pageNum} (${width}x${height}) in ${Math.round(performance.now() - renderStart)}ms`);

              // ── Upload / encode phase ───────────────────────────────────
              let base64 = "";
              let imageUrl: string | undefined;
              let uploadedPath: string | null = null;
              if (firstPageStartMs === undefined) {
               firstPageStartMs = performance.now();
             }

             const uploadStart = performance.now();

              if (scenario.imageInputMode === "google_files") {
                patchResult(scenario.id, { currentTask: `Uploading pg. ${pageNum} to Google...`, taskStartTime: performance.now() });
                const uploadApiUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${cfg.googleApiKey}`;
                const uploadRes = await fetch(uploadApiUrl, {
                  method: "POST",
                  headers: {
                    "X-Goog-Upload-Protocol": "raw",
                    "X-Goog-Upload-Command": "start, upload, finalize",
                    "X-Goog-Upload-Header-Content-Length": pageBlob.size.toString(),
                    "X-Goog-Upload-Header-Content-Type": mimeType,
                    "Content-Type": mimeType,
                  },
                  body: pageBlob,
                });
                if (!uploadRes.ok) {
                  const e = await uploadRes.json().catch(() => ({}));
                  throw new Error(`Files API: ${e.error?.message || uploadRes.statusText}`);
                }
                const uploadData = await uploadRes.json();
                let fileObj = uploadData.file;
                while (fileObj.state === "PROCESSING") {
                  patchResult(scenario.id, { currentTask: `Polling Google File state (pg. ${pageNum})...`, taskStartTime: performance.now() });
                  await new Promise((r) => setTimeout(r, 1000));
                  const chk = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/${fileObj.name}?key=${cfg.googleApiKey}`
                  );
                  if (!chk.ok) throw new Error("Failed to poll file state.");
                  fileObj = await chk.json();
                }
                if (fileObj.state === "FAILED") throw new Error("Files API processing failed.");
                imageUrl = fileObj.uri;
                base64 = "";
                pageResult.requestPayloadKb = new Blob([imageUrl ?? ""]).size / 1024;
              } else if (scenario.imageInputMode === "supabase" && supabaseConfig) {
                patchResult(scenario.id, { currentTask: `Uploading pg. ${pageNum} to Supabase...`, taskStartTime: performance.now() });
                const sessionId = `bench-${Date.now()}-p${pageNum}`;
                const filePath = `benchmark-${sessionId}.webp`;
                uploadedPath = await uploadToSupabase(pageBlob, supabaseConfig, filePath);
                imageUrl = await getSignedUrl(
                  uploadedPath,
                  supabaseConfig,
                  calculateAdaptiveTTL(pageNums.length - pi)
                );
                pageResult.requestPayloadKb = new Blob([imageUrl ?? ""]).size / 1024;
                base64 = "";
              } else {
                patchResult(scenario.id, { currentTask: `Encoding pg. ${pageNum} to Base64...`, taskStartTime: performance.now() });
                // base64 encode
                base64 = await blobToBase64(pageBlob);
                pageResult.requestPayloadKb = base64.length / 1024; // Actual base64 string size
              }

            pageResult.imageSizeKb = pageBlob.size / 1024;
            pageResult.uploadDurationMs = performance.now() - uploadStart;
            
            if (pageResult.imageSizeKb > 0 && pageResult.requestPayloadKb !== undefined) {
              pageResult.payloadEfficiency = ((pageResult.imageSizeKb - pageResult.requestPayloadKb) / pageResult.imageSizeKb) * 100;
            }

            logger.debug(`[Benchmark] ${scenario.label} - pg. ${pageNum} ${scenario.imageInputMode} prep done: ${Math.round(pageResult.uploadDurationMs)}ms (${pageResult.imageSizeKb?.toFixed(1)} KB image, eff: ${pageResult.payloadEfficiency?.toFixed(1)}%)`);

            // ── AI extraction ───────────────────────────────────────────
              let firstChunk = false;
              const aiStart = performance.now();

              patchResult(scenario.id, { currentTask: `Waiting for AI (pg. ${pageNum})...`, taskStartTime: performance.now() });
              logger.info(`[Benchmark] ${scenario.label} - pg. ${pageNum} requesting AI...`, { 
                mode: scenario.imageInputMode,
                model: modelToUse
              });

              const result = await extractMarkdown({
                provider: scenario.provider,
                openRouterKey: cfg.openRouterKey,
                googleApiKey: cfg.googleApiKey,
                ollamaUrl: cfg.ollamaUrl,
                anthropicApiKey: cfg.anthropicApiKey,
                model: modelToUse,
                base64Image: base64,
                imageInputMode: scenario.imageInputMode,
                imageUrl,
                mimeType,
                signal: abortRef.current?.signal,
                onChunk: () => {
                  if (!firstChunk) {
                    pageResult.ttftMs = performance.now() - aiStart;
                    firstChunk = true;
                    patchResult(scenario.id, { currentTask: `Receiving stream (pg. ${pageNum})...`, taskStartTime: performance.now() });
                    logger.debug(`[Benchmark] ${scenario.label} - pg. ${pageNum} TTFT received: ${Math.round(pageResult.ttftMs!)}ms`);
                  }
                },
              });

              pageResult.durationMs = performance.now() - uploadStart; // full page time
              pageResult.promptTokens = result.usage?.prompt_tokens;
              pageResult.completionTokens = result.usage?.completion_tokens;
              pageResult.markdown = result.markdown;
              if (typeof result.cost === 'number') {
                pageResult.cost = result.cost;
              }

              logger.success(`[Benchmark] ${scenario.label} - pg. ${pageNum} complete`, {
                provider: scenario.provider,
                model: modelToUse,
                imageMode: scenario.imageInputMode,
                ttft: Math.round(pageResult.ttftMs || 0),
                tokens: (result.usage?.prompt_tokens || 0) + (result.usage?.completion_tokens || 0),
                duration: Math.round(pageResult.durationMs)
              });

              // ── Supabase cleanup ────────────────────────────────────────
              if (uploadedPath && supabaseConfig) {
                await deleteFromSupabase(uploadedPath, supabaseConfig).catch((e) => {
                  logger.warn(`[Benchmark] Supabase cleanup failed for ${uploadedPath}`, { error: String(e) });
                });
              }
            } catch (err: any) {
              if (err.name === "AbortError") {
                pageResult.errorMessage = "Stopped by user.";
              } else {
                pageResult.errorMessage = err.message || String(err);
                logger.error(`[Benchmark] ${scenario.label} - pg. ${pageNum} failed`, { 
                  provider: scenario.provider,
                  model: modelToUse,
                  imageMode: scenario.imageInputMode,
                  error: pageResult.errorMessage 
                });
              }
            }

            pageResults.push(pageResult);
            lastPageEndMs = performance.now();

            const sDone = pageResults.filter(p => !p.errorMessage);
            const sFail = pageResults.filter(p => p.errorMessage);

            patchResult(scenario.id, {
              pagesProcessed: sDone.length,
              pagesFailed: sFail.length,
              pageResults: [...pageResults],
              // Add simple progress stats
              promptTokens: sDone.reduce((acc, p) => acc + (p.promptTokens || 0), 0),
              completionTokens: sDone.reduce((acc, p) => acc + (p.completionTokens || 0), 0),
            });
          };

          if (options?.isParallel) {
            logger.info(`[Benchmark] ${scenario.label} - Running pages in PARALLEL`);
            patchResult(scenario.id, { currentTask: "Initializing parallel tasks...", taskStartTime: performance.now() });
            
            // Stagger parallel tasks slightly to avoid sudden resource spikes
            const tasks = Array.from({ length: pageNums.length }, async (_, i) => {
              if (i > 0) await new Promise(r => setTimeout(r, i * STAGGER_MS));
              return processPage(i);
            });
            await Promise.all(tasks);
          } else {
            for (let pi = 0; pi < pageNums.length; pi++) {
              await processPage(pi);
              if (stopRef.current || abortRef.current?.signal.aborted) break;
            }
          }

          if (stopRef.current) break;

          // ── Aggregate scenario result ─────────────────────────────────────
          const totalDurationMs = performance.now() - scenarioStart;
          const finalPages = [...pageResults];
          const successPages = finalPages.filter((p) => !p.errorMessage);
          const failedCount = finalPages.filter(p => p.errorMessage).length;

          // Derive cost from per-page results — consistent with all other aggregates (no mutable accumulator)
          const costPages = successPages.filter(p => typeof p.cost === 'number');
          const estimatedCostUsd = costPages.length > 0
            ? costPages.reduce((acc, p) => acc + p.cost!, 0)
            : undefined;

          // Recalculate all aggregates from finalPages to ensure consistency
          const totalPrompt = successPages.reduce((acc, p) => acc + (p.promptTokens || 0), 0);
          const totalCompletion = successPages.reduce((acc, p) => acc + (p.completionTokens || 0), 0);
          const totalOutputChars = successPages.reduce((acc, p) => acc + (p.markdown?.length || 0), 0);
          const totalImageSize = successPages.reduce((acc, p) => acc + (p.imageSizeKb || 0), 0);
          const totalPayload = successPages.reduce((acc, p) => acc + (p.requestPayloadKb || 0), 0);
          const totalEfficiency = successPages.reduce((acc, p) => acc + (p.payloadEfficiency || 0), 0);
          const ttftSuccessful = successPages.filter(p => p.ttftMs !== undefined);
          const totalTtft = ttftSuccessful.reduce((acc, p) => acc + (p.ttftMs || 0), 0);
          const ttftList = ttftSuccessful.map(p => p.ttftMs!);
          const uploadList = successPages.filter(p => p.uploadDurationMs !== undefined).map(p => p.uploadDurationMs!);

          logger.info(`[Benchmark] Scenario ${scenario.label} complete`, {
            provider: scenario.provider,
            model: modelToUse,
            imageMode: scenario.imageInputMode,
            avgTtft: ttftList.length > 0 ? Math.round(totalTtft / ttftList.length) : 0,
            totalTime: Math.round(totalDurationMs),
            totalTokens: totalPrompt + totalCompletion,
            cost: estimatedCostUsd !== undefined ? estimatedCostUsd : "N/A"
          });

          // Accurate TPS calculation logic based on mode
          const tps = (() => {
            if (options?.isParallel) {
              // Mode Parallel: Gunakan throughput (span dari page pertama mulai hingga coroutine terakhir selesai)
              const parallelSpanMs = (firstPageStartMs !== undefined && lastPageEndMs !== undefined)
                ? (lastPageEndMs - firstPageStartMs) 
                : totalDurationMs;
              return parallelSpanMs > 0 ? totalCompletion / (parallelSpanMs / 1000) : 0;
            } else {
              // Mode Serial: Gunakan akumulasi waktu AI murni (Kecepatan Generasi)
              const totalAiTimeMs = successPages.reduce((acc, p) => {
                const aiTime = (p.durationMs || 0) - (p.uploadDurationMs || 0);
                return acc + Math.max(0, aiTime);
              }, 0);
              return totalAiTimeMs > 0 ? totalCompletion / (totalAiTimeMs / 1000) : 0;
            }
          })();

          const getFinalStatus = (): BenchmarkStatus => {
            if (failedCount === pageNums.length) return "error";
            if (failedCount > 0) return "partial";
            return "done";
          };

          patchResult(scenario.id, {
            status: getFinalStatus(),
            currentTask: undefined,
            taskStartTime: undefined,
            pagesProcessed: successPages.length,
            pagesFailed: failedCount,
            totalDurationMs,
            avgTtftMs: ttftList.length > 0 ? totalTtft / ttftList.length : undefined,
            minTtftMs: ttftList.length > 0 ? Math.min(...ttftList) : undefined,
            maxTtftMs: ttftList.length > 0 ? Math.max(...ttftList) : undefined,
            stdDevTtftMs: ttftList.length > 0 ? calculateStdDev(ttftList) : undefined,
            avgUploadMs: uploadList.length > 0 ? uploadList.reduce((a, b) => a + b, 0) / uploadList.length : undefined,
            minUploadMs: uploadList.length > 0 ? Math.min(...uploadList) : undefined,
            maxUploadMs: uploadList.length > 0 ? Math.max(...uploadList) : undefined,
            stdDevUploadMs: uploadList.length > 0 ? calculateStdDev(uploadList) : undefined,
            promptTokens: totalPrompt,
            completionTokens: totalCompletion,
            totalTokens: totalPrompt + totalCompletion,
            avgTokensPerPage:
              successPages.length > 0
                ? Math.round((totalPrompt + totalCompletion) / successPages.length)
                : undefined,
            tps,
            modelUsed: modelToUse,
            estimatedCostUsd,
            avgPayloadKb: successPages.length > 0 ? totalPayload / successPages.length : undefined,
            avgImageSizeKb: successPages.length > 0 ? totalImageSize / successPages.length : undefined,
            avgPayloadEfficiency: successPages.length > 0 
              ? totalEfficiency / successPages.length 
              : undefined,
            totalOutputChars: totalOutputChars,
            pageResults,
          });

          // Cool-down between scenarios
          if (si < scenarios.length - 1 && !stopRef.current) {
            logger.debug(`[Benchmark] Waiting ${COOLDOWN_MS}ms cool-down...`);
            await new Promise((r) => setTimeout(r, COOLDOWN_MS));
          }
        }
        logger.success(`[Benchmark] All benchmark scenarios finished.`);
      } finally {
        pdfDoc.destroy();
        abortRef.current = null;
        setIsRunning(false);
      }
    },
    [isRunning]
  );

  return { results, isRunning, runBenchmark, stopBenchmark, resetResults };
}
