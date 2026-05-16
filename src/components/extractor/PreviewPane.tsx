import { ChevronLeft, ChevronRight, Check, LayoutGrid, Zap, X, FileImage } from "lucide-react";
import { PageThumbnail } from "./PageThumbnail";
import { cacheDB, STORES } from "../../lib/cache";
import type { AppFile, PageCache } from "../../lib/utils/types";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface Props {
  file: AppFile | null;
  isPdf: boolean;
  pdfDoc: PDFDocumentProxy | null;
  pdfPageCount: number;
  currentPdfPage: number;
  previewUrl: string | null;
  thumbCache: PageCache;
  setThumbCache: (val: PageCache | ((prev: PageCache) => PageCache)) => void;
  markdownCache: Record<number, string>;
  selectedPages: Set<number>;
  showPageGrid: boolean;
  isRenderingPage: boolean;
  onPageChange: (delta: number) => void;
  onToggleGrid: (show: boolean) => void;
  onSelectAll: () => void;
  onSelectUnextracted: () => void;
  onClearSelection: () => void;
  onTogglePageSelection: (pageNum: number) => void;
  onBatchExtract: () => void;
  onPageClick: (pageNum: number) => void;
}

export function PreviewPane({
  file, isPdf, pdfDoc, pdfPageCount, currentPdfPage,
  previewUrl, thumbCache, setThumbCache,
  markdownCache, selectedPages, showPageGrid, isRenderingPage,
  onPageChange, onToggleGrid, onSelectAll, onSelectUnextracted,
  onClearSelection, onTogglePageSelection, onBatchExtract, onPageClick
}: Props) {
  return (
    <div className="flex-1 bg-card rounded-lg border border-border overflow-hidden flex flex-col">
      <div className="bg-secondary/50 px-3 py-2 border-b border-border flex justify-between items-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</span>
        {isPdf && pdfPageCount > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(-1)}
              disabled={currentPdfPage <= 1}
              className="p-1 hover:bg-secondary disabled:opacity-30 rounded transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-muted-foreground tabular-nums flex items-center gap-1.5">
              {currentPdfPage} / {pdfPageCount}
              {markdownCache[currentPdfPage] && (
                <Check size={12} className="text-primary animate-in zoom-in duration-300" />
              )}
            </span>
            <button
              onClick={() => onPageChange(1)}
              disabled={currentPdfPage >= pdfPageCount}
              className="p-1 hover:bg-secondary disabled:opacity-30 rounded transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            <div className="w-px h-3 bg-border mx-1"></div>
            <button
              onClick={() => onToggleGrid(!showPageGrid)}
              className={`p-1 rounded transition-all ${showPageGrid ? 'bg-primary/20 text-primary shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'hover:bg-secondary text-muted-foreground'}`}
              title="Page Overview"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 relative group">
        {showPageGrid && isPdf && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-20 p-6 overflow-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <LayoutGrid size={16} className="text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">Document Navigator</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onSelectAll}
                  className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  All
                </button>
                <button
                  onClick={onSelectUnextracted}
                  className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  Unextracted
                </button>
                <button
                  onClick={onClearSelection}
                  className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  None
                </button>
                <div className="w-px h-3 bg-border mx-1"></div>
                <button
                  onClick={onBatchExtract}
                  disabled={selectedPages.size === 0}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider disabled:opacity-30 disabled:grayscale hover:bg-primary/90 transition-all"
                >
                  <Zap size={12} />
                  <span>Process {selectedPages.size}</span>
                </button>
                <button
                  onClick={() => onToggleGrid(false)}
                  className="p-1.5 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
              {Array.from({ length: pdfPageCount }, (_, i) => i + 1).map(pageNum => (
                <PageThumbnail
                  key={pageNum}
                  doc={pdfDoc}
                  pageNum={pageNum}
                  isActive={currentPdfPage === pageNum}
                  isExtracted={!!markdownCache[pageNum]}
                  isSelected={selectedPages.has(pageNum)}
                  onSelect={() => onTogglePageSelection(pageNum)}
                  thumbUrl={thumbCache[pageNum]}
                  onRenderComplete={(pNum, result: any) => {
                    const url = URL.createObjectURL(result.blob);
                    setThumbCache(prev => ({ ...prev, [pNum]: url }));
                    if (file?.path) cacheDB.set(STORES.THUMBNAILS, { path: file.path, pageNum: pNum }, result.blob);
                  }}
                  onClick={() => onPageClick(pageNum)}
                />
              ))}
            </div>
          </div>
        )}

        {!file ? (
          <div className="flex flex-col items-center text-muted-foreground gap-3">
            <FileImage size={36} className="opacity-30" />
            <p className="text-sm">No file selected</p>
            <p className="text-xs opacity-60">Supports Images and PDF</p>
          </div>
        ) : (
          <>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className={`max-w-full h-auto max-h-full object-contain rounded border border-border transition-all duration-300 ${isRenderingPage ? 'opacity-40 scale-[0.98] blur-[2px]' : 'opacity-100 scale-100 blur-0'}`}
              />
            )}

            {(isRenderingPage || !previewUrl) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/40 backdrop-blur-[2px] z-10 animate-in fade-in duration-300">
                <div className="relative w-10 h-10 mb-4">
                  <div className="absolute inset-0 border-2 border-primary/20 rounded-full"></div>
                  <div className="absolute inset-0 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase animate-pulse">
                  Page {currentPdfPage}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
