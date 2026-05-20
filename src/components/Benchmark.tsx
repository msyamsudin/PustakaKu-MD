import { useState, useCallback, useEffect } from "react";
import {
  FlaskConical, Square, RotateCcw, Download, FileText,
  Zap, ChevronDown, ChevronRight, Loader2, AlertTriangle,
  Cloud, HardDrive, ShieldCheck, ShieldX, Maximize2, X, Columns2
} from "lucide-react";
import { useBenchmark, verifyScenario } from "../hooks/useBenchmark";
import { getPdfPageCount } from "../lib/pdfUtils";
import { BenchmarkConsole } from "./BenchmarkConsole";
import { fetchModels } from "../lib/api";
import type { Provider, ModelInfo } from "../lib/api";
import type { BenchmarkScenario, BenchmarkResult } from "../lib/utils/types";

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmt = (ms?: number) => ms === undefined ? "—" : ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
const fmtKb = (kb?: number) => kb === undefined ? "—" : kb < 1024 ? `${kb.toFixed(1)}KB` : `${(kb / 1024).toFixed(2)}MB`;
const fmtCost = (usd?: number) => usd === undefined ? "—" : `$${usd.toFixed(5)}`;
const fmtNum = (n?: number) => n === undefined ? "—" : n.toLocaleString();

function findBestCpsId(results: BenchmarkResult[]): string | null {
  const done = results.filter(r => r.status === "done" && r.cps !== undefined && r.cps > 0);
  if (!done.length) return null;
  return done.reduce((a, b) => a.cps! > b.cps! ? a : b).scenarioId;
}
function findBestCharsId(results: BenchmarkResult[]): string | null {
  const done = results.filter(r => r.status === "done" && r.totalOutputChars !== undefined && r.totalOutputChars > 0);
  if (!done.length) return null;
  return done.reduce((a, b) => a.totalOutputChars! > b.totalOutputChars! ? a : b).scenarioId;
}

function exportCsv(results: BenchmarkResult[], model: string, pages: number) {
  const headers = [
    "Scenario", "Status", "Model", "Execution Mode", "Layout Analysis", "Loop Detection", "Pages OK", "Pages Failed", "Total Duration",
    "Avg TTFT", "Min TTFT", "Max TTFT", "StdDev TTFT",
    "TPS", "CPS",
    "Avg Upload", "Min Upload", "Max Upload", "StdDev Upload",
    "Prompt Tokens", "Completion Tokens", "Avg Tokens/Page",
    "Avg Payload KB", "Avg Image KB", "Payload Efficiency", "Est. Cost USD", "Total Output Chars", "Resolution", "Error"
  ];
  const rows = results.map((r: BenchmarkResult) => [
    r.label, r.status, r.modelUsed || model, r.isParallel ? "Parallel" : "Sequential",
    r.enableColumnDetection !== false ? "ON" : "OFF",
    r.enableLoopDetection !== false ? "ON" : "OFF",
    r.pagesProcessed, r.pagesFailed,
    r.totalDurationMs ?? "",
    r.avgTtftMs?.toFixed(0) ?? "", r.minTtftMs?.toFixed(0) ?? "", r.maxTtftMs?.toFixed(0) ?? "", r.stdDevTtftMs?.toFixed(0) ?? "",
    r.tps?.toFixed(1) ?? "0", r.cps?.toFixed(1) ?? "0",
    r.avgUploadMs?.toFixed(0) ?? "", r.minUploadMs?.toFixed(0) ?? "", r.maxUploadMs?.toFixed(0) ?? "", r.stdDevUploadMs?.toFixed(0) ?? "",
    r.promptTokens ?? "", r.completionTokens ?? "", r.avgTokensPerPage ?? "",
    r.avgPayloadKb?.toFixed(2) ?? "", r.avgImageSizeKb?.toFixed(2) ?? "",
    r.avgPayloadEfficiency !== undefined ? `${r.avgPayloadEfficiency.toFixed(1)}%` : "",
    r.estimatedCostUsd?.toFixed(6) ?? "",
    r.totalOutputChars ?? "",
    r.pageResults[0] ? `${r.pageResults[0].width}x${r.pageResults[0].height}` : "—",
    r.errorMessage ?? ""
  ]);
  const csv = [headers, ...rows].map(row =>
    row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
  ).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const modeName = results[0]?.isParallel ? "paralel" : "serial";
  a.href = url; a.download = `benchmark-${pages}pages-${modeName}-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Live Timer for active tasks ──────────────────────────────────────────
function LiveTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(performance.now() - startTime);
    }, 100);
    return () => clearInterval(timer);
  }, [startTime]);

  return <span className="tabular-nums opacity-80">{fmt(elapsed)}</span>;
}



// ── Scenario row (with expand for per-page detail) ─────────────────────────────
function ResultRow({ r, isBestCps, isBestChars, isCompact = true }: { r: BenchmarkResult; isBestCps: boolean; isBestChars: boolean; isCompact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const rowCls = r.status === "running" ? "bg-blue-500/5"
    : (isBestCps && isBestChars) ? "bg-indigo-500/5"
      : isBestCps ? "bg-cyan-500/5"
        : isBestChars ? "bg-violet-500/5"
          : r.status === "error" ? "bg-destructive/5"
            : r.status === "skipped" ? "opacity-50" : "";
  const hasPages = r.pageResults.length > 0;

  const tdCls = isCompact ? "px-2 py-2" : "px-4 py-4";
  const textCls = isCompact ? "text-[10px]" : "text-sm";
  const labelCls = isCompact ? "text-[10px]" : "text-sm";

  return (
    <>
      <tr className={`transition-colors border-b border-white/2 ${rowCls}`}>
        <td className={`${tdCls} font-bold`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            {hasPages && (
              <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-primary transition-colors shrink-0">
                {expanded ? <ChevronDown size={isCompact ? 12 : 16} /> : <ChevronRight size={isCompact ? 12 : 16} />}
              </button>
            )}
            <span className={`${labelCls} leading-tight ${(isBestCps && isBestChars) ? "text-indigo-400" : isBestCps ? "text-cyan-400" : isBestChars ? "text-violet-400" : "text-foreground/90"}`}>
              {r.label}
            </span>
          </div>
          {r.status === "running" && r.currentTask && (
            <div className="flex items-center gap-2 text-[9px] text-blue-400/70 font-mono whitespace-nowrap mt-1 ml-4 animate-in fade-in slide-in-from-left-1">
              <span className="shrink-0">└ {r.currentTask}</span>
              {r.taskStartTime && <LiveTimer startTime={r.taskStartTime} />}
            </div>
          )}
          {r.errorMessage && (
            <p className={`${isCompact ? "text-[9px]" : "text-xs"} text-rose-400/60 mt-0.5 ml-4 font-normal italic leading-tight`}>
              ! {r.errorMessage}
            </p>
          )}
        </td>
        <td className={`${tdCls} text-center text-muted-foreground/80 tabular-nums ${textCls}`}>
          {r.status !== "pending" && r.status !== "skipped"
            ? `${r.pagesProcessed}/${r.pagesProcessed + r.pagesFailed}`
            : "—"}
        </td>
        <td className={`${tdCls} text-right font-bold tabular-nums ${textCls} text-foreground/80`}>{fmt(r.totalDurationMs)}</td>
        <td className={`${tdCls} text-right tabular-nums text-muted-foreground/80 ${textCls}`}>{fmt(r.stdDevTtftMs)}</td>
        <td className={`${tdCls} text-right tabular-nums font-bold text-amber-400/80 ${textCls}`}>{r.tps?.toFixed(1) ?? "—"}</td>
        <td className={`${tdCls} text-right tabular-nums font-bold ${isBestCps ? "text-cyan-400" : "text-blue-400/80"} ${textCls}`}>{r.cps?.toFixed(1) ?? "—"}</td>
        <td className={`${tdCls} text-right tabular-nums text-muted-foreground/70 ${textCls}`}>{fmt(r.avgUploadMs)}</td>
        <td className={`${tdCls} text-right tabular-nums text-muted-foreground/80 ${textCls}`}>
          {r.promptTokens !== undefined ? fmtNum(r.promptTokens + (r.completionTokens || 0)) : "—"}
        </td>
        <td className={`${tdCls} text-right tabular-nums font-bold ${isBestChars ? "text-violet-400" : "text-muted-foreground/80"} ${textCls}`}>
          {r.totalOutputChars !== undefined ? fmtNum(r.totalOutputChars) : "—"}
        </td>
        <td className={`${tdCls} text-right tabular-nums text-muted-foreground/70 ${textCls}`}>{fmtKb(r.avgPayloadKb)}</td>
        <td className={`${tdCls} text-right tabular-nums font-bold ${textCls} ${r.avgPayloadEfficiency !== undefined ? (r.avgPayloadEfficiency > 0 ? "text-emerald-400" : "text-rose-400") : "text-muted-foreground/70"}`}>
          {r.avgPayloadEfficiency !== undefined ? `${r.avgPayloadEfficiency > 0 ? "+" : ""}${r.avgPayloadEfficiency.toFixed(1)}%` : "—"}
        </td>
        <td className={`${tdCls} text-right tabular-nums font-bold ${textCls} text-muted-foreground/80`}>{fmtCost(r.estimatedCostUsd)}</td>
      </tr>
      {expanded && hasPages && r.pageResults.map(pr => {
        const pgAiTimeMs = Math.max(0, (pr.durationMs || 0) - (pr.uploadDurationMs || 0));
        const pgCps = pgAiTimeMs > 0 && pr.markdown?.length ? (pr.markdown.length / (pgAiTimeMs / 1000)).toFixed(1) : "—";
        return (
          <tr key={pr.pageNum} className={`bg-white/1 text-muted-foreground/50 border-b border-white/1 ${isCompact ? "text-[9px]" : "text-xs"}`}>
            <td className={`${isCompact ? "pl-8" : "pl-12"} py-1.5 font-mono italic`}>└─ {isCompact ? "p" : "page_"}{pr.pageNum}</td>
            <td className={`${tdCls} py-1.5`}>—</td>
            <td className={`${tdCls} py-1.5 text-right tabular-nums`}>{fmt(pr.durationMs)}</td>
            <td className={`${tdCls} py-1.5 text-right tabular-nums`}>{fmt(pr.ttftMs)}</td>
            <td className={`${tdCls} py-1.5 text-right`}>—</td>
            <td className={`${tdCls} py-1.5 text-right tabular-nums text-blue-400/60`}>{pgCps}</td>
            <td className={`${tdCls} py-1.5 text-right tabular-nums`}>{fmt(pr.uploadDurationMs)}</td>
            <td className={`${tdCls} py-1.5 text-right tabular-nums text-muted-foreground/80`}>
              {pr.promptTokens !== undefined ? (
                <div className="flex flex-col items-end leading-none gap-0.5">
                  <span className="text-muted-foreground/50">{fmtNum(pr.promptTokens + (pr.completionTokens || 0))}</span>
                  <span className="text-[7px] font-bold tracking-tighter opacity-60">
                    <span className="text-blue-400">{fmtNum(pr.promptTokens)}i</span>
                    <span className="mx-0.5 opacity-20">/</span>
                    <span className="text-violet-400">{fmtNum(pr.completionTokens)}o</span>
                  </span>
                </div>
              ) : "—"}
            </td>
            <td className={`${tdCls} py-1.5 text-right tabular-nums text-muted-foreground/80`}>
              {pr.markdown?.length !== undefined ? fmtNum(pr.markdown.length) : "—"}
            </td>
            <td className={`${tdCls} py-1.5 text-right tabular-nums`}>{fmtKb(pr.requestPayloadKb)}</td>
            <td className={`${tdCls} py-1.5 text-right tabular-nums ${pr.payloadEfficiency !== undefined ? (pr.payloadEfficiency > 0 ? "text-emerald-400/60" : "text-rose-400/60") : ""}`}>
              {pr.payloadEfficiency !== undefined ? `${pr.payloadEfficiency > 0 ? "+" : ""}${pr.payloadEfficiency.toFixed(1)}%` : "—"}
            </td>
            <td className={`${tdCls} py-1.5 text-right`}>—</td>
          </tr>
        );
      })}
    </>
  );
}

// ── Results Display (with Zoom capability) ──────────────────────────────────
function ResultsDisplay({ results, isRunning, bestCpsId, bestCharsId }: {
  results: BenchmarkResult[];
  isRunning: boolean;
  bestCpsId: string | null;
  bestCharsId: string | null;
}) {
  const [isZoomed, setIsZoomed] = useState(false);
  const firstResult = results[0];
  const cfg = (() => { try { return JSON.parse(localStorage.getItem("pustakaku-settings") || "{}"); } catch { return {} as any; } })();
  const autoAnalysisOn = firstResult?.enableColumnDetection !== false;

  const TableHeader = ({ isCompact }: { isCompact: boolean }) => (
    <thead className={`${isCompact ? "text-[10px]" : "text-xs"} border-b border-white/5 bg-white/5 text-muted-foreground/70 font-bold uppercase tracking-tight`}>
      <tr>
        <th className={`text-left px-2 py-2 ${isCompact ? "w-[20%]" : ""}`}>Scenario</th>
        <th className={`text-center px-2 py-2 ${isCompact ? "w-[6%]" : ""}`}>Pgs</th>
        <th className={`text-right px-2 py-2 ${isCompact ? "w-[9%]" : ""}`}>Time</th>
        <th className={`text-right px-2 py-2 ${isCompact ? "w-[9%]" : ""}`}>σ TTFT</th>
        <th className={`text-right px-2 py-2 ${isCompact ? "w-[8%]" : ""} text-amber-400/80`}>TPS</th>
        <th className={`text-right px-2 py-2 ${isCompact ? "w-[8%]" : ""} text-blue-400/80`}>CPS</th>
        <th className={`text-right px-2 py-2 ${isCompact ? "w-[9%]" : ""}`}>Upload</th>
        <th className={`text-right px-2 py-2 ${isCompact ? "w-[10%]" : ""}`}>Tokens</th>
        <th className={`text-right px-2 py-2 ${isCompact ? "w-[10%]" : ""} text-violet-400/80`}>Chars</th>
        <th className={`text-right px-2 py-2 ${isCompact ? "w-[10%]" : ""}`}>Payload</th>
        <th className={`text-right px-2 py-2 ${isCompact ? "w-[8%]" : ""}`}>{isCompact ? "Eff." : "Efficiency"}</th>
        <th className={`text-right px-2 py-2 ${isCompact ? "w-[11%]" : ""} text-emerald-400/80`}>Cost</th>
      </tr>
    </thead>
  );

  const TableContent = ({ isCompact }: { isCompact: boolean }) => (
    <div className={`overflow-x-auto ${isCompact ? "scrollbar-none" : "scrollbar-thin scrollbar-thumb-white/10"}`}>
      <table className={`w-full border-collapse ${isCompact ? "table-fixed text-[10px]" : "text-sm"} font-mono`}>
        <TableHeader isCompact={isCompact} />
        <tbody className="divide-y divide-white/3">
          {results.map(r => (
            <ResultRow
              key={r.scenarioId}
              r={r}
              isBestCps={r.scenarioId === bestCpsId}
              isBestChars={r.scenarioId === bestCharsId}
              isCompact={isCompact}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  const uniqueModels = Array.from(new Set(results.map(r => r.modelUsed).filter(Boolean)));
  const modelText = uniqueModels.length > 0 ? `[ ${uniqueModels.join(", ")} ]` : "";

  const Footer = () => (
    <div className="px-5 py-3 border-t border-white/5 bg-black/20 flex flex-wrap items-center gap-6 text-[9px] text-muted-foreground/50 uppercase tracking-widest">
      <span className="ml-auto font-mono opacity-50"># system_ready_for_export</span>
    </div>
  );

  return (
    <>
      {/* Compact View */}
      <div className="bg-[#0c0c0c] border border-white/10 rounded-none overflow-hidden shadow-2xl group relative">
        <div className="px-5 py-3 border-b border-white/5 bg-black/40 flex items-center gap-3 flex-wrap">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">Execution Results</h3>
          {modelText && <span className="text-[9px] text-muted-foreground/40 font-mono italic opacity-60">{modelText}</span>}
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border leading-none ${autoAnalysisOn ? "text-sky-400 bg-sky-500/10 border-sky-500/20" : "text-muted-foreground bg-secondary border-border"}`}>
            Layout Analysis: {autoAnalysisOn ? "ON" : "OFF"}
          </span>
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border leading-none ${firstResult?.enableLoopDetection !== false ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-muted-foreground bg-secondary border-border"}`}>
            Loop Detection: {firstResult?.enableLoopDetection !== false ? "ON" : "OFF"}
          </span>
          {firstResult && (
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border leading-none ${firstResult.isParallel ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-muted-foreground bg-secondary border-border"}`}>
              Mode: {firstResult.isParallel ? `Parallel (max ${cfg.batchConcurrency || 3} pgs)` : "Sequential"}
            </span>
          )}
          {isRunning && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[9px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 animate-pulse">
              $ monitoring_active...
            </span>
          )}
          {!isRunning && (
            <button
              onClick={() => setIsZoomed(true)}
              className="ml-auto p-1.5 text-muted-foreground/70 hover:text-primary hover:bg-primary/10 rounded transition-all flex items-center gap-2 text-[9px] uppercase tracking-wider font-bold"
            >
              <Maximize2 size={12} /> Expand View
            </button>
          )}
        </div>

        <div className="cursor-zoom-in" onClick={() => !isRunning && setIsZoomed(true)}>
          <TableContent isCompact={true} />
        </div>
        <Footer />
      </div>

      {/* Zoom Modal */}
      {isZoomed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-10 bg-black/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08),transparent_70%)] pointer-events-none" />

          <div className="w-full max-w-7xl max-h-[90vh] bg-[#080808] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="px-8 py-5 border-b border-white/10 bg-black/60 flex items-center justify-between">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-primary mb-1">Processing Metrics</h3>
                  <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-mono">Multimodal Input Efficiency Report</p>
                </div>
                {modelText && (
                  <div className="h-8 w-px bg-white/10 mx-2" />
                )}
                {modelText && (
                  <span className="text-[10px] text-muted-foreground/40 font-mono bg-white/5 px-3 py-1 rounded border border-white/5">
                    {modelText}
                  </span>
                )}
                <span className={`text-[10px] font-mono px-3 py-1 rounded border leading-none ${autoAnalysisOn ? "text-sky-400 bg-sky-500/10 border-sky-500/20" : "text-muted-foreground bg-white/5 border-white/5"}`}>
                  Layout Analysis: {autoAnalysisOn ? "ON" : "OFF"}
                </span>
                <span className={`text-[10px] font-mono px-3 py-1 rounded border leading-none ${firstResult?.enableLoopDetection !== false ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-muted-foreground bg-white/5 border-white/5"}`}>
                  Loop Detection: {firstResult?.enableLoopDetection !== false ? "ON" : "OFF"}
                </span>
                {firstResult && (
                  <span className={`text-[10px] font-mono px-3 py-1 rounded border leading-none ${firstResult.isParallel ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-muted-foreground bg-white/5 border-white/5"}`}>
                    Execution Mode: {firstResult.isParallel ? `Parallel (max ${cfg.batchConcurrency || 3} pgs)` : "Sequential"}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsZoomed(false)}
                className="p-2 text-muted-foreground/70 hover:text-white hover:bg-white/5 rounded-full transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="flex-1 overflow-auto p-8 bg-[#080808]">
              <div className="bg-black/40 border border-white/5 shadow-2xl">
                <TableContent isCompact={false} />
                <div className="px-8 py-4 border-t border-white/5 bg-black/40 flex items-center gap-8 text-[10px] text-muted-foreground/70 uppercase tracking-[0.2em]">
                  <div className="ml-auto flex items-center gap-4 opacity-50 font-mono">
                    <span>GEN_ID: {Math.random().toString(36).substring(7).toUpperCase()}</span>
                    <span>TIMESTAMP: {new Date().toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>

              {/* Export Hint */}
              <div className="mt-6 flex justify-center">
                <p className="text-[10px] text-muted-foreground/50 font-mono italic">
                  Press Alt+PrtScn or use a screen capture tool to share this high-resolution report.
                </p>
              </div>
            </div>
          </div>

          {/* Overlay Click to Close */}
          <div className="absolute inset-0 -z-10" onClick={() => setIsZoomed(false)} />
        </div>
      )}
    </>
  );
}

// ── All defined scenarios ─────────────────────────────────────────────────────
const ALL_SCENARIOS: BenchmarkScenario[] = [
  { id: "google-base64", label: "Google — Base64", provider: "google", imageInputMode: "base64" },
  { id: "google-files", label: "Google — Files API", provider: "google", imageInputMode: "google_files" },
  { id: "openrouter-base64", label: "OpenRouter — Base64", provider: "openrouter", imageInputMode: "base64" },
  { id: "openrouter-supabase", label: "OpenRouter — Supabase", provider: "openrouter", imageInputMode: "supabase" },
  { id: "ollama-base64", label: "Ollama — Base64", provider: "ollama", imageInputMode: "base64" },
];

// ── Main Component ─────────────────────────────────────────────────────────────
export function Benchmark() {
  const { results, isRunning, runBenchmark, stopBenchmark, resetResults } = useBenchmark();

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(3);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set(ALL_SCENARIOS.map(s => s.id)));
  const [isParallel, setIsParallel] = useState(false);
  const [enableLoopDetection, setEnableLoopDetection] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [providerModels, setProviderModels] = useState<Record<Provider, ModelInfo[]>>({
    google: [],
    openrouter: [],
    anthropic: [],
    ollama: [],
  });

  const [scenarioModels, setScenarioModels] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("pustakaku-benchmark-scenario-models");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("pustakaku-benchmark-scenario-models", JSON.stringify(scenarioModels));
  }, [scenarioModels]);

  const cfg = (() => { try { return JSON.parse(localStorage.getItem("pustakaku-settings") || "{}"); } catch { return {}; } })();

  const getResolvedModelForScenario = useCallback((scenario: BenchmarkScenario) => {
    if (scenarioModels[scenario.id]) {
      return scenarioModels[scenario.id];
    }
    if (scenario.provider === "google" && cfg.googleModel) return cfg.googleModel;
    if (scenario.provider === "openrouter" && cfg.openRouterModel) return cfg.openRouterModel;
    if (scenario.provider === "anthropic" && cfg.anthropicModel) return cfg.anthropicModel;
    if (scenario.provider === "ollama" && cfg.ollamaModel) return cfg.ollamaModel;
    return cfg.selectedModel || "";
  }, [scenarioModels, cfg]);

  const fetchAllProviderModels = useCallback(async () => {
    const providers: Provider[] = ["google", "openrouter", "anthropic", "ollama"];
    for (const p of providers) {
      let hasCredentials = false;
      if (p === "google" && cfg.googleApiKey?.trim()) hasCredentials = true;
      if (p === "openrouter" && cfg.openRouterKey?.trim()) hasCredentials = true;
      if (p === "anthropic" && cfg.anthropicApiKey?.trim()) hasCredentials = true;
      if (p === "ollama") hasCredentials = true;

      if (!hasCredentials) {
        let defaults: ModelInfo[] = [];
        if (p === "google") {
          defaults = [
            { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", capabilities: { vision: true } },
            { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", capabilities: { vision: true } },
            { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash Exp", capabilities: { vision: true } },
          ];
        } else if (p === "anthropic") {
          defaults = [
            { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", capabilities: { vision: true } },
            { id: "claude-3-opus-20240229", name: "Claude 3 Opus", capabilities: { vision: true } },
            { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", capabilities: { vision: true } },
            { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", capabilities: { vision: true } },
          ];
        } else if (p === "openrouter") {
          defaults = [
            { id: "google/gemini-flash-1.5", name: "Gemini 1.5 Flash (OR)", capabilities: { vision: true } },
            { id: "meta-llama/llama-3.2-11b-vision-instruct:free", name: "Llama 3.2 11B Vision Free", capabilities: { vision: true } },
            { id: "qwen/qwen-2-vl-7b-instruct:free", name: "Qwen 2 VL 7B Free", capabilities: { vision: true } },
            { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", capabilities: { vision: true } },
          ];
        } else if (p === "ollama") {
          defaults = [
            { id: "llava:latest", name: "LLaVA", capabilities: { vision: true } },
            { id: "llama3.2-vision:latest", name: "Llama 3.2 Vision", capabilities: { vision: true } },
          ];
        }
        setProviderModels(prev => ({ ...prev, [p]: defaults }));
        continue;
      }

      try {
        const fetched = await fetchModels(p, {
          googleApiKey: cfg.googleApiKey,
          openRouterKey: cfg.openRouterKey,
          anthropicApiKey: cfg.anthropicApiKey,
          ollamaUrl: cfg.ollamaUrl,
        });
        setProviderModels(prev => ({ ...prev, [p]: fetched }));
      } catch (err) {
        console.error(`Failed to fetch models for ${p}`, err);
        let defaults: ModelInfo[] = [];
        if (p === "google") {
          defaults = [
            { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", capabilities: { vision: true } },
            { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", capabilities: { vision: true } },
          ];
        } else if (p === "anthropic") {
          defaults = [
            { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", capabilities: { vision: true } },
            { id: "claude-3-opus-20240229", name: "Claude 3 Opus", capabilities: { vision: true } },
          ];
        } else if (p === "openrouter") {
          defaults = [
            { id: "google/gemini-flash-1.5", name: "Gemini 1.5 Flash (OR)", capabilities: { vision: true } },
            { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", capabilities: { vision: true } },
          ];
        } else if (p === "ollama") {
          defaults = [
            { id: "llava:latest", name: "LLaVA", capabilities: { vision: true } },
          ];
        }
        setProviderModels(prev => ({ ...prev, [p]: defaults }));
      }
    }
  }, [cfg.googleApiKey, cfg.openRouterKey, cfg.anthropicApiKey, cfg.ollamaUrl]);

  useEffect(() => {
    fetchAllProviderModels();
  }, []);

  // Re-evaluate settings every render (reactive)
  const scenarioChecks = ALL_SCENARIOS.map(s => {
    const sWithModel = { ...s, selectedModel: getResolvedModelForScenario(s) };
    return {
      ...sWithModel,
      check: verifyScenario(sWithModel)
    };
  });
  const activeModel = cfg.selectedModel || "—";

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) return;
    setLoadingPdf(true);
    setPdfFile(file);
    try {
      const count = await getPdfPageCount(file);
      setPageCount(count);
      setPageFrom(1);
      setPageTo(Math.min(3, count));
    } catch { setPageCount(0); }
    finally { setLoadingPdf(false); }
  }, []);

  const pageNums = Array.from(
    { length: Math.max(0, pageTo - pageFrom + 1) },
    (_, i) => pageFrom + i
  ).filter(n => n >= 1 && n <= pageCount);

  const handleStart = async () => {
    if (!pdfFile || pageNums.length === 0) return;
    const scenarios = scenarioChecks
      .filter(s => enabledIds.has(s.id))
      .map(({ check: _check, ...s }) => s);
    await runBenchmark(pdfFile, pageNums, scenarios, { isParallel, enableLoopDetection });
  };

  const toggleId = (id: string, val: boolean) => {
    setEnabledIds(prev => { const n = new Set(prev); val ? n.add(id) : n.delete(id); return n; });
  };

  const bestCpsId = findBestCpsId(results);
  const bestCharsId = findBestCharsId(results);
  const anyDone = results.some(r => r.status === "done");

  const labelCls = "block text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-[0.1em]";
  const inputCls = "w-full px-3 py-2 bg-secondary text-foreground border border-border rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 px-1">
        <div className="p-2 bg-primary/10 rounded-lg text-primary"><FlaskConical size={20} /></div>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Input Method Benchmark</h2>
          <p className="text-xs text-muted-foreground">Compare speed, tokens, payload and cost across image input methods using batch PDF extraction.</p>
        </div>
      </div>

      {/* Config card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-center gap-2 flex-wrap">
          <Zap size={15} className="text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-wider">Configuration</h3>
          <div className="ml-auto flex items-center gap-2">
            {activeModel !== "—" && (
              <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-2 py-0.5 rounded border border-border">
                Model: {activeModel}
              </span>
            )}
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border leading-none ${cfg.enableColumnDetection !== false ? "text-sky-400 bg-sky-500/10 border-sky-500/20" : "text-muted-foreground bg-secondary border-border"}`}>
              Layout Analysis: {cfg.enableColumnDetection !== false ? "ON" : "OFF"}
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border leading-none ${isParallel ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-muted-foreground bg-secondary border-border"}`}>
              Mode: {isParallel ? `Parallel (max ${cfg.batchConcurrency || 3} pgs)` : "Sequential"}
            </span>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PDF Picker */}
          <div>
            <label className={labelCls}>PDF Document</label>
            <div
              className={`border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer ${dragOver ? "border-primary bg-primary/5 scale-[1.01]"
                : pdfFile ? "border-border bg-secondary/20"
                  : "border-border hover:border-primary/40 hover:bg-secondary/20"
                }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => { const i = document.createElement("input"); i.type = "file"; i.accept = ".pdf"; i.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f); }; i.click(); }}
            >
              {loadingPdf ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 size={20} className="animate-spin" /> <span className="text-sm">Loading PDF…</span>
                </div>
              ) : pdfFile ? (
                <div className="flex items-center gap-3 p-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">
                    <FileText size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{pdfFile.name}</p>
                    <p className="text-[10px] text-muted-foreground">{(pdfFile.size / 1024).toFixed(1)} KB · {pageCount} pages</p>
                    <p className="text-[10px] text-primary mt-1">Click to change file</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                  <FileText size={28} className="opacity-40" />
                  <p className="text-xs font-medium">Drop PDF here or click to browse</p>
                </div>
              )}
            </div>

            {/* Page range */}
            {pdfFile && pageCount > 0 && (
              <div className="mt-3 space-y-2">
                <label className={labelCls}>Page Range to Benchmark</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground mb-1 block">From</label>
                    <input type="number" min={1} max={pageCount} value={pageFrom}
                      onChange={e => setPageFrom(Math.max(1, Math.min(pageCount, +e.target.value)))}
                      className={inputCls} />
                  </div>
                  <span className="text-muted-foreground mt-5">–</span>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground mb-1 block">To</label>
                    <input type="number" min={1} max={pageCount} value={pageTo}
                      onChange={e => setPageTo(Math.max(pageFrom, Math.min(pageCount, +e.target.value)))}
                      className={inputCls} />
                  </div>
                  <div className="mt-5 px-3 py-2 bg-secondary border border-border rounded-lg text-xs text-muted-foreground font-mono whitespace-nowrap">
                    {pageNums.length} page{pageNums.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scenarios + Settings Validation */}
          <div>
            <label className={labelCls}>Scenarios & Settings Validation</label>
            <div className="space-y-2">
              {scenarioChecks.map(s => {
                const isEnabled = enabledIds.has(s.id);
                const { valid, reason } = s.check;
                const modeIcon = s.imageInputMode === "base64"
                  ? <HardDrive size={12} className="shrink-0 text-muted-foreground" />
                  : <Cloud size={12} className="shrink-0 text-primary" />;

                return (
                  <div
                    key={s.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                      !valid ? "opacity-50 border-border bg-secondary/10"
                        : isEnabled ? "border-primary/40 bg-primary/5"
                          : "border-border hover:border-primary/30 hover:bg-secondary/30"
                    }`}
                  >
                    <label className={`flex items-center gap-3 flex-1 cursor-pointer select-none`}>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={!valid}
                        onChange={e => toggleId(s.id, e.target.checked)}
                        className="accent-primary w-4 h-4 shrink-0"
                      />
                      {modeIcon}
                      <span className="text-sm font-medium">{s.label}</span>
                      {valid ? (
                        <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
                      ) : (
                        <span title={reason}><ShieldX size={13} className="text-destructive shrink-0" /></span>
                      )}
                      {!valid && (
                        <span className="text-[9px] text-destructive/80 max-w-[120px] leading-tight ml-2">
                          {reason}
                        </span>
                      )}
                    </label>

                    {valid && isEnabled && (
                      <div className="flex items-center gap-2 pl-7 sm:pl-0 animate-in fade-in slide-in-from-right-1 duration-200">
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider whitespace-nowrap">Model:</span>
                        <select
                          value={getResolvedModelForScenario(s)}
                          onChange={e => {
                            setScenarioModels(prev => ({ ...prev, [s.id]: e.target.value }));
                          }}
                          className="px-2 py-1 bg-secondary text-foreground border border-border rounded-lg text-xs focus:outline-none focus:border-primary transition-all cursor-pointer font-mono max-w-[180px] truncate"
                        >
                          {providerModels[s.provider] && providerModels[s.provider].length > 0 ? (
                            providerModels[s.provider].map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name.includes("/") ? m.name.split("/")[1] : m.name}
                              </option>
                            ))
                          ) : (
                            <option value={getResolvedModelForScenario(s)}>
                              {getResolvedModelForScenario(s).includes("/") ? getResolvedModelForScenario(s).split("/")[1] : getResolvedModelForScenario(s) || "Default"}
                            </option>
                          )}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Settings issues summary */}
            {scenarioChecks.some(s => !s.check.valid) && (
              <div className="mt-3 p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-lg">
                <p className="text-[10px] text-yellow-400 font-semibold flex items-center gap-1 mb-1">
                  <AlertTriangle size={11} /> Some scenarios are disabled due to missing settings:
                </p>
                {scenarioChecks.filter(s => !s.check.valid).map(s => (
                  <p key={s.id} className="text-[10px] text-muted-foreground ml-3">· <span className="font-medium">{s.label}</span>: {s.check.reason}</p>
                ))}
              </div>
            )}

            {/* Execution mode & Slicing */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 flex flex-col">
                <label className={labelCls}>Execution Mode</label>
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer h-full w-full ${!isParallel ? "border-primary/40 bg-primary/5" : "border-border hover:bg-secondary/20"}`}>
                    <input type="radio" checked={!isParallel} onChange={() => setIsParallel(false)} className="accent-primary shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">Sequential</span>
                      <span className="text-[10px] text-muted-foreground">Page by page</span>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer h-full w-full ${isParallel ? "border-primary/40 bg-primary/5" : "border-border hover:bg-secondary/20"}`}>
                    <input type="radio" checked={isParallel} onChange={() => setIsParallel(true)} className="accent-primary shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">Parallel</span>
                      <span className="text-[10px] text-muted-foreground">Concurrent ({cfg.batchConcurrency || 3} pgs)</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex flex-col">
                <label className={labelCls}>Layout Analysis</label>
                <button
                  onClick={() => {
                    const nextValue = cfg.enableColumnDetection === false;
                    const nextCfg = { ...cfg, enableColumnDetection: nextValue };
                    localStorage.setItem("pustakaku-settings", JSON.stringify(nextCfg));
                    resetResults();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all h-full ${cfg.enableColumnDetection !== false ? "border-sky-500/40 bg-sky-500/10 shadow-[0_0_15px_rgba(56,189,248,0.15)]" : "border-border hover:bg-secondary/20"}`}
                >
                  <Columns2 size={18} className={`shrink-0 ${cfg.enableColumnDetection !== false ? "text-sky-400" : "text-muted-foreground"}`} />
                  <div className="flex flex-col items-start text-left min-w-0">
                    <span className={`text-sm font-bold truncate w-full ${cfg.enableColumnDetection !== false ? "text-sky-400" : "text-foreground"}`}>Auto Columns</span>
                    <span className="text-[10px] text-muted-foreground truncate w-full">
                      {cfg.enableColumnDetection !== false ? "AI Layout Detect" : "Disabled (Faster)"}
                    </span>
                  </div>
                  <div className={`ml-auto w-8 h-4 shrink-0 rounded-full p-0.5 transition-all ${cfg.enableColumnDetection !== false ? "bg-sky-500" : "bg-secondary"}`}>
                    <div className={`w-3 h-3 bg-white rounded-full transition-all ${cfg.enableColumnDetection !== false ? "translate-x-4" : "translate-x-0"}`} />
                  </div>
                </button>
              </div>

              <div className="flex flex-col">
                <label className={labelCls}>Loop Detection</label>
                <button
                  onClick={() => {
                    setEnableLoopDetection(prev => !prev);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all h-full ${enableLoopDetection ? "border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "border-border hover:bg-secondary/20"}`}
                >
                  <ShieldCheck size={18} className={`shrink-0 ${enableLoopDetection ? "text-emerald-400" : "text-muted-foreground"}`} />
                  <div className="flex flex-col items-start text-left min-w-0">
                    <span className={`text-sm font-bold truncate w-full ${enableLoopDetection ? "text-emerald-400" : "text-foreground"}`}>Dual-Guard</span>
                    <span className="text-[10px] text-muted-foreground truncate w-full">
                      {enableLoopDetection ? "Prevent Loops" : "Disabled"}
                    </span>
                  </div>
                  <div className={`ml-auto w-8 h-4 shrink-0 rounded-full p-0.5 transition-all ${enableLoopDetection ? "bg-emerald-500" : "bg-secondary"}`}>
                    <div className={`w-3 h-3 bg-white rounded-full transition-all ${enableLoopDetection ? "translate-x-4" : "translate-x-0"}`} />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center gap-3 flex-wrap">
          {!isRunning ? (
            <div className="flex items-center gap-4 flex-wrap">
              <button onClick={handleStart}
                disabled={!pdfFile || pageNums.length === 0 || enabledIds.size === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold uppercase tracking-wider transition-all hover:bg-primary/90 hover:-translate-y-0.5 disabled:opacity-40 disabled:translate-y-0 shadow-lg shadow-primary/20">
                <FlaskConical size={15} /> Start Benchmark
              </button>
              {isParallel && pdfFile && pageNums.length > 0 && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg font-mono">
                  Info: {pageNums.length} halaman akan diproses paralel (maks. {Math.min(cfg.batchConcurrency || 3, pageNums.length)} halaman secara bersamaan).
                </span>
              )}
            </div>
          ) : (
            <button onClick={stopBenchmark}
              className="flex items-center gap-2 px-6 py-2.5 bg-destructive/10 text-destructive border border-destructive/30 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-destructive/20">
              <Square size={15} /> Stop
            </button>
          )}
          {results.length > 0 && !isRunning && (
            <>
              <button onClick={resetResults}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-foreground border border-border rounded-xl text-sm font-semibold hover:bg-secondary/80">
                <RotateCcw size={14} /> Reset
              </button>
              {anyDone && (
                <button onClick={() => exportCsv(results, activeModel, pageNums.length)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-foreground border border-border rounded-xl text-sm font-semibold hover:bg-secondary/80 ml-auto">
                  <Download size={14} /> Export CSV
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dedicated Console */}
      <BenchmarkConsole />

      {/* Results table */}
      {/* Results table */}
      {results.length > 0 && (
        <ResultsDisplay
          results={results}
          isRunning={isRunning}
          bestCpsId={bestCpsId}
          bestCharsId={bestCharsId}
        />
      )}

      {/* Empty state */}
      {results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <FlaskConical size={40} className="opacity-20 mb-4" />
          <p className="text-sm font-medium">No benchmark results yet</p>
          <p className="text-xs mt-1">Load a PDF, select page range and scenarios, then click "Start Benchmark".</p>
        </div>
      )}
    </div>
  );
}
