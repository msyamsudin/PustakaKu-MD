import { FileText, Trash2, LayoutGrid, X, Copy } from "lucide-react";
import { MarkdownThumbnail } from "./MarkdownThumbnail";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { AsciiVisionLoader } from "../AsciiVisionLoader";

interface Props {
  markdown: string;
  markdownCache: Record<number, string>;
  currentPdfPage: number;
  pdfPageCount: number;
  isPdf: boolean;
  isExtracting: boolean;
  isStreaming: boolean;
  showMarkdownGrid: boolean;
  selectedMarkdownPages: Set<number>;
  onToggleGrid: (show: boolean) => void;
  onSelectMarkdownPage: (pageNum: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onBatchCopy: () => void;
  onBatchDelete: () => void;
  onDeletePage: (pageNum: number) => void;
  onPageClick: (pageNum: number) => void;
  onClearMarkdown: () => void;
}

export function ResultPane({
  markdown, markdownCache, currentPdfPage, pdfPageCount, isPdf,
  isExtracting, isStreaming, showMarkdownGrid,
  selectedMarkdownPages, onToggleGrid, onSelectMarkdownPage,
  onSelectAll, onSelectNone, onBatchCopy, onBatchDelete,
  onDeletePage, onPageClick, onClearMarkdown
}: Props) {
  return (
    <div className="flex-1 bg-card rounded-lg border border-border overflow-hidden flex flex-col">
      <div className="bg-secondary/50 px-3 py-2 border-b border-border flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Markdown</span>
          {Object.keys(markdownCache).length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
              {Object.keys(markdownCache).length}
            </span>
          )}
          {isExtracting && (
            <div className="relative flex h-1.5 w-1.5 ml-3" title={isStreaming ? "AI is receiving data" : "AI is thinking..."}>
              {isStreaming ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500 animate-pulse"></span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {markdown && (
            <button
              onClick={onClearMarkdown}
              className="p-1 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground transition-colors"
              title="Clear Markdown"
            >
              <Trash2 size={14} />
            </button>
          )}
          {isPdf && pdfPageCount > 0 && (
            <button
              onClick={() => onToggleGrid(!showMarkdownGrid)}
              className={`p-1 rounded transition-all ${showMarkdownGrid ? 'bg-primary/20 text-primary shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'hover:bg-secondary text-muted-foreground'}`}
              title="Markdown Overview"
            >
              <LayoutGrid size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-5 markdown-viewer max-w-none relative scroll-smooth">
        {showMarkdownGrid && isPdf && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-20 p-6 overflow-auto animate-in fade-in zoom-in-95 duration-200 not-prose">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">Markdown Overview</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onSelectAll}
                  className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  All
                </button>
                <button
                  onClick={onSelectNone}
                  className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  None
                </button>
                <div className="w-px h-3 bg-border mx-1"></div>
                
                {selectedMarkdownPages.size > 0 && (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                    <button
                      onClick={onBatchCopy}
                      className="flex items-center gap-2 bg-secondary text-secondary-foreground px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-secondary/80 transition-all border border-border"
                      title="Copy Selected"
                    >
                      <Copy size={12} />
                      <span>Copy {selectedMarkdownPages.size}</span>
                    </button>
                    <button
                      onClick={onBatchDelete}
                      className="flex items-center gap-2 bg-destructive/10 text-destructive px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-destructive/20 transition-all border border-destructive/20"
                      title="Delete Selected"
                    >
                      <Trash2 size={12} />
                      <span>Delete {selectedMarkdownPages.size}</span>
                    </button>
                    <div className="w-px h-3 bg-border mx-1"></div>
                  </div>
                )}

                <button
                  onClick={() => onToggleGrid(false)}
                  className="p-1.5 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {Object.keys(markdownCache).length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <FileText size={32} className="opacity-20 mb-2" />
                <p className="text-xs font-medium opacity-60">No pages extracted yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {Object.keys(markdownCache).map(Number).sort((a, b) => a - b).map(pageNum => (
                  <MarkdownThumbnail
                    key={pageNum}
                    pageNum={pageNum}
                    content={markdownCache[pageNum]}
                    isActive={currentPdfPage === pageNum}
                    isSelected={selectedMarkdownPages.has(pageNum)}
                    onSelect={(e) => {
                      e.stopPropagation();
                      onSelectMarkdownPage(pageNum);
                    }}
                    onClick={() => onPageClick(pageNum)}
                    onDelete={(e) => {
                      e.stopPropagation();
                      onDeletePage(pageNum);
                    }}
                    onCopy={async (e) => {
                      e.stopPropagation();
                      try {
                        await navigator.clipboard.writeText(markdownCache[pageNum]);
                        alert(`Page ${pageNum} markdown copied!`);
                      } catch (err) {
                        console.error("Failed to copy!", err);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {!markdown ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            {isExtracting ? (
              <AsciiVisionLoader />
            ) : (
              <span className="text-sm italic opacity-60">Result will appear here…</span>
            )}
          </div>
        ) : (
          <MarkdownRenderer markdown={markdown} />
        )}
      </div>
    </div>
  );
}
