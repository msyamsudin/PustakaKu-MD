import { memo } from "react";
import { Copy, Trash2, Check } from "lucide-react";

export const MarkdownThumbnail = memo(function MarkdownThumbnail({
  pageNum, content, isActive, isSelected, onClick, onSelect, onDelete, onCopy
}: {
  pageNum: number;
  content: string;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
  onSelect: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onCopy: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="relative group/md-card aspect-3/4.5 w-full">
      <button
        onClick={onClick}
        className={`w-full h-full flex flex-col rounded-lg border overflow-hidden transition-all shadow-sm ${isActive
            ? 'border-primary ring-2 ring-primary/40 z-10 bg-primary/5'
            : isSelected
              ? 'border-primary/50 bg-primary/5'
              : 'border-border bg-secondary/10 hover:border-primary/30 hover:bg-secondary/20'
          }`}
      >
        <div className="flex-1 p-2 text-[8px] text-left overflow-hidden opacity-60 font-mono leading-tight whitespace-pre-wrap select-none">
          {content || "Empty..."}
        </div>

        <div className="bg-secondary/40 px-2 py-1.5 border-t border-border flex justify-between items-center w-full">
          <span className={`text-[10px] font-black ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
            PG. {pageNum}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover/md-card:opacity-100 transition-opacity">
            <div
              onClick={onCopy}
              className="p-1 hover:bg-primary/20 rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              title="Copy Markdown"
            >
              <Copy size={10} />
            </div>
            <div
              onClick={onDelete}
              className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              title="Delete Extraction"
            >
              <Trash2 size={10} />
            </div>
          </div>
        </div>

        {isActive && (
          <div className="absolute top-1.5 right-1.5">
            <div className="w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)] border border-background"></div>
          </div>
        )}
      </button>

      <div
        onClick={onSelect}
        className={`absolute bottom-8 left-2 p-1 rounded-md cursor-pointer transition-all z-20 border shadow-lg ${isSelected
            ? "bg-primary text-primary-foreground border-primary scale-110 opacity-100"
            : "bg-background/90 text-muted-foreground border-border opacity-0 group-hover/md-card:opacity-100 hover:bg-secondary hover:text-foreground"
          }`}
      >
        <Check size={10} strokeWidth={isSelected ? 4 : 2} />
      </div>
    </div>
  );
});
