import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ExtractionResult, ModelInfo, Provider } from "../api";

export interface AppFile {
  name: string;
  path: string;
}

export type ImageInputMode = "base64" | "supabase" | "google_files";

export interface AppConfig {
  provider: string;
  selectedModel: string;
  openRouterKey?: string;
  anthropicApiKey?: string;
  ollamaUrl?: string;
  googleApiKey?: string;
  anthropicModel?: string;
  imageInputMode?: ImageInputMode;  // default: "base64"
  supabaseProjectId?: string;        // project reference ID (e.g. "abcdefghijklmnop")
  supabaseServiceKey?: string;      // service_role / secret key
  supabaseBucket?: string;          // default: "page-images"
  batchMode?: "sequential" | "parallel";
  batchConcurrency?: number;        // default: 3
  enableColumnDetection?: boolean;  // default: true
}

export interface BatchProgress {
  current: number;
  total: number;
  status: string;
  currentImage?: string;
  currentPage?: number;
  activePages?: number[]; // For parallel mode
}

export type PageCache = Record<number, string>;       // pageNum → Blob URL
export type MarkdownCacheMap = Record<number, string>; // pageNum → markdown string

export type { PDFDocumentProxy, ExtractionResult, ModelInfo, Provider };

// ── Benchmark types ──────────────────────────────────────────────────────────

export interface BenchmarkScenario {
  id: string;              // e.g. "google-base64", "openrouter-supabase"
  label: string;           // Human-readable name
  provider: Provider;
  imageInputMode: ImageInputMode;
}

export type BenchmarkStatus = "pending" | "running" | "done" | "error" | "skipped" | "partial";

/** Per-page result collected during batch extraction */
export interface BenchmarkPageResult {
  pageNum: number;
  uploadDurationMs?: number;   // encode / upload phase for this page
  ttftMs?: number;             // time-to-first-token
  durationMs?: number;         // total time for this page
  promptTokens?: number;
  completionTokens?: number;
  requestPayloadKb?: number;   // size of the final AI request body (metadata + image/url)
  imageSizeKb?: number;        // raw size of the image data
  payloadEfficiency?: number;  // (imageSize - payloadSize) / imageSize * 100
  width?: number;
  height?: number;
  markdown?: string;
  cost?: number;           // API-reported cost for this page (USD), if available
  errorMessage?: string;
}

/** Aggregated result for one scenario across all benchmark pages */
export interface BenchmarkResult {
  scenarioId: string;
  label: string;
  status: BenchmarkStatus;
  isParallel?: boolean;

  // Aggregates across all pages
  pagesProcessed: number;
  pagesFailed: number;

  // Timing (ms)
  totalDurationMs?: number;       // wall time for all pages in this scenario
  avgTtftMs?: number;             // average TTFT across successful pages
  minTtftMs?: number;
  maxTtftMs?: number;
  stdDevTtftMs?: number;
  avgUploadMs?: number;           // average encode/upload time per page
  minUploadMs?: number;
  maxUploadMs?: number;
  stdDevUploadMs?: number;

  // Token usage (summed)
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  avgTokensPerPage?: number;
  tps?: number;
  modelUsed?: string;

  // Cost (USD, summed)
  estimatedCostUsd?: number;

  // Network (average per page)
  avgPayloadKb?: number;
  avgImageSizeKb?: number;
  avgPayloadEfficiency?: number;

  // Output quality
  totalOutputChars?: number;

  // Per-page breakdown (optional detail)
  pageResults: BenchmarkPageResult[];

  // Real-time tracking
  currentTask?: string;      // e.g. "Uploading to Supabase", "Waiting for AI"
  taskStartTime?: number;    // performance.now() of the current task start

  // Error (scenario-level, e.g. missing credentials)
  errorMessage?: string;
}
