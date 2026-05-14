import { UploadCloud, X, Zap, FileText, Copy, Check, Download, Coins, Timer, HardDrive, Cloud } from "lucide-react";
import type { AppFile, AppConfig } from "../../lib/utils/types";
import type { ExtractionResult } from "../../lib/api";

interface Props {
  file: AppFile | null;
  config: AppConfig | null;
  previewUrl: string | null;
  markdown: string;
  markdownCacheCount: number;
  isExtracting: boolean;
  isCopied: boolean;
  showPageGrid: boolean;
  showMarkdownGrid: boolean;
  selectedPagesCount: number;
  usage: ExtractionResult["usage"] | null;
  cost: number | null;
  extractDuration: number | null;
  onFileOpen: () => void;
  onCloseDocument: () => void;
  onExtract: () => void;
  onCopy: () => void;
  onSave: () => void;
  onBatchDownload: () => void;
  onDownloadCombined: () => void;
  onToggleBatchMode: () => void;
}

export function TopBar({
  file, config, previewUrl, markdown, markdownCacheCount,
  isExtracting, isCopied, showPageGrid, showMarkdownGrid,
  selectedPagesCount: _selectedPagesCount, usage, cost, extractDuration,
  onFileOpen, onCloseDocument, onExtract, onCopy,
  onSave, onBatchDownload, onDownloadCombined,
  onToggleBatchMode
}: Props) {
  return (
    <>
      <div className="flex justify-between items-center bg-card p-3 rounded-lg border border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onFileOpen}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/70 rounded-md text-sm font-medium transition-colors border border-border"
          >
            <UploadCloud size={16} />
            <span>Upload</span>
          </button>

          {file && (
            <div className="flex items-center gap-2 px-2 py-1 bg-secondary/30 rounded border border-border group/file">
              <span className="text-xs font-medium text-muted-foreground truncate max-w-[140px]">
                {file.name}
              </span>
              <button
                onClick={onCloseDocument}
                className="p-0.5 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground transition-colors"
                title="Close Document"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <div className={`flex items-center gap-2 px-2.5 py-1 rounded border text-[11px] font-semibold transition-all ${config
            ? "border-primary/25 text-primary"
            : "border-destructive/25 text-destructive"
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${config ? "bg-primary" : "bg-destructive"}`}></div>
            {config ? (
              <div className="flex items-center gap-3">
                <span className="flex gap-1">
                  <span className="uppercase opacity-60">{config.provider}:</span>
                  <span>{config.selectedModel.includes("/") ? config.selectedModel.split("/")[1] : config.selectedModel}</span>
                </span>
                <div className="flex items-center gap-1.5 pl-3 border-l border-border/50 text-[10px] uppercase tracking-wider opacity-80">
                  {config.imageInputMode === "supabase" ? (
                    <>
                      <Cloud size={10} className="text-primary" />
                      <span>Supabase</span>
                    </>
                  ) : config.imageInputMode === "google_files" ? (
                    <>
                      <Cloud size={10} className="text-primary" />
                      <span>G-Cloud</span>
                    </>
                  ) : (
                    <>
                      <HardDrive size={10} className="text-primary" />
                      <span>Base64</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              "No provider configured"
            )}
          </div>
          <button
            onClick={onToggleBatchMode}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all border ${(showPageGrid || showMarkdownGrid)
              ? "bg-primary/20 border-primary/30 text-primary shadow-[0_0_15px_rgba(16,185,129,0.15)]"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/70 border-border"
              }`}
            title="Batch Mode (Grid Overview)"
          >
            <Zap size={16} className={(showPageGrid || showMarkdownGrid) ? "animate-pulse" : ""} />
            <span>Batch</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExtract}
            disabled={!previewUrl || isExtracting}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-md transition-colors font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/85"
          >
            {isExtracting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                <span>Extracting…</span>
              </>
            ) : (
              <>
                <FileText size={16} />
                <span>Extract</span>
              </>
            )}
          </button>

          <button
            onClick={onCopy}
            disabled={!markdown}
            className="flex items-center gap-2 px-2.5 py-2 bg-secondary text-secondary-foreground rounded-md border border-border hover:bg-secondary/70 disabled:opacity-30 transition-colors"
            title="Copy to Clipboard"
          >
            {isCopied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
          </button>

          <button
            onClick={onSave}
            disabled={!markdown}
            className="flex items-center gap-2 px-2.5 py-2 bg-secondary text-secondary-foreground rounded-md border border-border hover:bg-secondary/70 disabled:opacity-30 transition-colors"
            title="Save current page as .md"
          >
            <Download size={16} />
          </button>

          {markdownCacheCount > 1 && (
            <div className="flex items-center gap-1.5 bg-secondary/30 p-1 rounded-lg border border-border animate-in fade-in slide-in-from-right-4 duration-500">
              <button
                onClick={onBatchDownload}
                className="flex items-center gap-2 px-2.5 py-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors"
                title="Download All as Separate Files"
              >
                <div className="relative">
                  <Download size={14} />
                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full border border-background"></div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider">All</span>
              </button>

              <div className="w-px h-4 bg-border"></div>

              <button
                onClick={onDownloadCombined}
                className="flex items-center gap-2 px-2.5 py-1.5 text-accent hover:bg-accent/10 rounded-md transition-colors"
                title="Download All Combined into One File"
              >
                <FileText size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Combined</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Token Usage Row */}
      {usage && (
        <div className="bg-card border border-border p-2.5 rounded-lg flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Coins size={13} className="text-primary" />
              <span className="font-semibold">Tokens:</span>
              <span className="text-muted-foreground">{usage.total_tokens}</span>
            </div>
            <span className="text-muted-foreground">
              (In: {usage.prompt_tokens} / Out: {usage.completion_tokens})
            </span>
            {extractDuration && (
              <div className="flex items-center gap-1.5 pl-3 border-l border-border text-muted-foreground">
                <Timer size={13} className="text-primary" />
                <span>{extractDuration.toFixed(2)}s</span>
              </div>
            )}
          </div>

          {cost !== null && cost > 0 && (
            <div className="font-medium text-accent text-xs px-2 py-0.5 rounded border border-accent/20">
              Cost: ${cost.toFixed(6)}
            </div>
          )}

          {config?.provider === "ollama" && (
            <div className="font-medium text-primary text-xs">
              Local (Free)
            </div>
          )}
        </div>
      )}
    </>
  );
}
