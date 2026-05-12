import { useEffect, useRef, useState } from "react";
import { logger, LogEntry } from "../lib/logger";
import { Terminal, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BenchmarkConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial load + filter
    const allLogs = logger.getLogs();
    setLogs(allLogs.filter(l => l.message.startsWith("[Benchmark]")));

    const unsubscribe = logger.subscribe((entry) => {
      if (entry.message.startsWith("[Benchmark]")) {
        setLogs((prev) => [...prev, entry].slice(-100));
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-none overflow-hidden shadow-sm">
      <div 
        className="px-5 py-3 border-b border-border bg-black/40 flex items-center justify-between cursor-pointer hover:bg-black/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Benchmark Console</h3>
          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">{logs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setLogs([]);
            }}
            className="p-1.5 rounded-md hover:bg-white/5 text-muted-foreground hover:text-rose-400 transition-colors"
            title="Clear Console"
          >
            <Trash2 size={13} />
          </button>
          {isExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronUp size={14} className="text-muted-foreground" />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div 
              ref={scrollRef}
              className="p-4 bg-black/60 font-mono text-xs max-h-[300px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-white/10"
            >
              {logs.map((log) => {
                const isError = log.level === "error";
                const isSuccess = log.level === "success";
                const isWarn = log.level === "warn";
                
                // Remove [Benchmark] prefix for cleaner view
                const displayMessage = log.message.replace("[Benchmark] ", "");
                
                return (
                  <div key={log.id} className="flex gap-3 border-b border-white/5 pb-1 last:border-0">
                    <span className="text-muted-foreground/30 shrink-0 text-[11px]">
                      {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <div className="flex-1">
                      <span className={`
                        font-bold mr-2 text-[12px]
                        ${isError ? "text-rose-400" : isSuccess ? "text-emerald-400" : isWarn ? "text-amber-400" : "text-sky-400"}
                      `}>
                        {displayMessage}
                      </span>
                      {log.details && (
                        <div className="mt-1 text-muted-foreground/50 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
                          {Object.entries(log.details).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-1.5 overflow-hidden">
                              <span className="opacity-40">{k}:</span>
                              <span className="truncate">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
