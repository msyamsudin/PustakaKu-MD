import { useEffect, useState } from "react";
import { X, Sparkles, Terminal } from "lucide-react";
import type { BatchProgress } from "../../lib/utils/types";
import { logger, LogEntry } from "../../lib/logger";

interface Props {
  progress: BatchProgress;
  isExtracting: boolean;
  isStreaming: boolean;
  onCancel: () => void;
}

export function BatchOverlay({ progress, isExtracting, isStreaming, onCancel }: Props) {
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    // Initialize with recent logs
    setRecentLogs(logger.getLogs().slice(-4));

    const unsubscribe = logger.subscribe((entry) => {
      setRecentLogs((prev) => [...prev, entry].slice(-4));
    });

    return unsubscribe;
  }, []);

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-md z-50 flex items-center justify-center p-8 animate-in fade-in duration-300">
      <div className="max-w-md w-full bg-card border border-border rounded-xl p-6 shadow-2xl space-y-6">
        {progress.currentImage && (
          <div className="relative group/batch-preview aspect-video w-full overflow-hidden rounded-lg border border-border bg-black/20 flex items-center justify-center">
            <img
              src={progress.currentImage}
              alt="Batch Preview"
              className="max-w-full h-full object-contain transition-all duration-300"
            />
            <div className="absolute inset-0 bg-linear-to-t from-background/40 to-transparent pointer-events-none"></div>
            <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-background/60 backdrop-blur-md rounded text-[10px] font-bold text-foreground border border-border shadow-sm uppercase tracking-wider">
              Page {progress.currentPage}
            </div>
            
            {isExtracting && (
              <div className="absolute top-3 right-3 p-2 bg-background/20 backdrop-blur-md rounded-full border border-primary/20 shadow-[0_0_15px_rgba(16,185,129,0.2)] animate-in zoom-in duration-500">
                <Sparkles 
                  size={14} 
                  className={`transition-colors duration-500 ${isStreaming ? 'text-primary animate-pulse-glow' : 'text-amber-500 animate-pulse'}`} 
                />
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium">
            <div className="flex items-center gap-2">
              <span>Progress</span>
              {isExtracting && (
                <div className="relative flex h-1.5 w-1.5">
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
            <span>{progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            ></div>
          </div>
          <div className="text-[10px] text-center text-muted-foreground uppercase tracking-widest pt-1">
            {progress.current} / {progress.total} Pages
          </div>
        </div>

        {/* Active Workers for Parallel Mode */}
        {progress.activePages && progress.activePages.length > 1 && (
          <div className="space-y-2 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">
              <Sparkles size={10} className="text-primary" />
              <span>Active Workers ({progress.activePages.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {progress.activePages.map((pageNum) => (
                <div 
                  key={pageNum}
                  className="px-2 py-1 bg-primary/10 border border-primary/20 rounded text-[10px] font-bold text-primary animate-pulse"
                >
                  Page {pageNum}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Activity Feed */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">
            <Terminal size={10} />
            <span>Live Activity</span>
          </div>
          <div className="bg-black/40 rounded-lg border border-border/50 p-3 font-mono text-[10px] space-y-1.5 min-h-[90px] flex flex-col justify-end">
            {recentLogs.length === 0 ? (
              <div className="text-muted-foreground/30 italic">Waiting for activity...</div>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="flex gap-2 line-clamp-1">
                  <span className={`shrink-0 ${
                    log.level === 'error' ? 'text-rose-400' : 
                    log.level === 'success' ? 'text-emerald-400' : 
                    log.level === 'warn' ? 'text-amber-400' : 
                    'text-sky-400'
                  }`}>
                    [{log.level.toUpperCase().slice(0, 3)}]
                  </span>
                  <span className="text-foreground/70 truncate">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <button
          onClick={onCancel}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all font-semibold text-sm"
        >
          <X size={16} />
          <span>Cancel Processing</span>
        </button>
      </div>
    </div>
  );
}
