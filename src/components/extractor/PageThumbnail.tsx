import { useState, useEffect, memo } from "react";
import { FileText, Check } from "lucide-react";
import { renderPageFromDoc, thumbnailRenderQueue } from "../../lib/pdfUtils";

export const PageThumbnail = memo(function PageThumbnail({
  doc, pageNum, isActive, isExtracted, onClick, onSelect, isSelected, thumbUrl, onRenderComplete
}: {
  doc: any;
  pageNum: number;
  isActive: boolean;
  isExtracted: boolean;
  onClick: () => void;
  onSelect: () => void;
  isSelected: boolean;
  thumbUrl: string | undefined;
  onRenderComplete: (pageNum: number, blob: Blob) => void;
}) {
  const [isLoading, setIsLoading] = useState(!thumbUrl);

  useEffect(() => {
    if (!doc || thumbUrl) return;
    let isMounted = true;
    setIsLoading(true);
    // Use the render queue to cap concurrent renders at 6
    thumbnailRenderQueue.add(async () => {
      if (!isMounted) return;
      try {
        const blob = await renderPageFromDoc(doc, pageNum, 0.4).promise;
        if (isMounted) {
          onRenderComplete(pageNum, blob);
          setIsLoading(false);
        }
      } catch (e) {
        if (isMounted) setIsLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [doc, pageNum, thumbUrl]);

  return (
    <div className="relative group/page aspect-3/4.5 w-full">
      <button
        onClick={onClick}
        className={`w-full h-full flex flex-col items-center justify-center rounded-lg border overflow-hidden transition-all relative shadow-sm ${isActive
            ? 'border-primary ring-2 ring-primary/40 z-10 shadow-primary/20'
            : isExtracted
              ? 'border-primary/30 hover:border-primary/50 bg-primary/5'
              : 'border-border bg-secondary/10 hover:border-primary/30 hover:bg-secondary/20'
          }`}
      >
        {thumbUrl ? (
          <img src={thumbUrl} className="w-full h-full object-cover animate-in fade-in duration-500" alt={`Page ${pageNum}`} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-secondary/20 gap-2">
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            ) : (
              <FileText size={16} className="opacity-20" />
            )}
            <span className="text-[10px] font-bold opacity-30">{pageNum}</span>
          </div>
        )}

        {/* Page Number Badge */}
        <div className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-black tabular-nums backdrop-blur-md border shadow-sm ${isActive ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/80 text-foreground border-border'
          }`}>
          {pageNum}
        </div>

        {isExtracted && (
          <div className="absolute top-1.5 left-1.5">
            <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)] border border-background"></div>
          </div>
        )}

        {/* Selection Glow */}
        {isSelected && (
          <div className="absolute inset-0 border-2 border-primary pointer-events-none animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-primary/10"></div>
          </div>
        )}
      </button>

      <div
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className={`absolute bottom-2 left-2 p-1.5 rounded-md cursor-pointer transition-all z-20 border shadow-lg ${isSelected
            ? "bg-primary text-primary-foreground border-primary scale-110 opacity-100"
            : "bg-background/90 text-muted-foreground border-border opacity-0 group-hover/page:opacity-100 hover:bg-secondary hover:text-foreground"
          }`}
      >
        <Check size={12} strokeWidth={isSelected ? 4 : 2} />
      </div>
    </div>
  );
});
