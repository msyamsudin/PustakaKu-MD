import { useEffect, useRef, useState } from "react";
import { logger, LogEntry } from "../../lib/logger";

import {
  Terminal,
  X,
  Trash2,
  Activity,
  Search,
  Maximize2,
  Minimize2,
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";

export function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [autoScroll, setAutoScroll] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs(logger.getLogs());

    const unsubscribe = logger.subscribe((entry) => {
      setLogs((prev) => [...prev, entry].slice(-200));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop =
        scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((log) => {
    const matchesFilter =
      filter === "all" || log.level === filter;

    const matchesSearch =
      log.message
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (log.details &&
        JSON.stringify(log.details)
          .toLowerCase()
          .includes(search.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  // Calculate summary metrics
  const summary = logs.reduce(
    (acc, log) => {
      if (log.level === "success" && log.details) {
        acc.totalTokens += Number(log.details.tokens || log.details.total_tokens || 0);
        acc.totalDuration += Number(log.details.duration || 0);
        acc.totalCost += Number(log.details.cost || log.details.total_cost || 0);
        acc.successCount += 1;
      } else if (log.level === "error") {
        acc.errorCount += 1;
      }
      return acc;
    },
    {
      totalTokens: 0,
      totalDuration: 0,
      totalCost: 0,
      successCount: 0,
      errorCount: 0,
    }
  );

  const avgTokensPerSec =
    summary.totalDuration > 0
      ? (summary.totalTokens / summary.totalDuration).toFixed(1)
      : "0";


  return (
    <>
      {/* Floating Button */}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
        fixed bottom-6 right-6 z-100
        flex items-center gap-2
        px-4 py-2.5
        rounded-2xl
        border border-border
        shadow-2xl
        transition-all
        ${isOpen
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground hover:border-primary/30"
          }
      `}
      >
        {isOpen ? (
          <X size={16} />
        ) : (
          <Terminal size={16} />
        )}

        <span className="text-[11px] font-semibold uppercase tracking-wide">
          {isOpen ? "Close" : "Activity"}
        </span>

        {!isOpen && logs.length > 0 && (
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        )}
      </button>

      {/* Panel */}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{
              opacity: 0,
              y: 20,
              scale: 0.98,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: 20,
              scale: 0.98,
            }}
            transition={{
              duration: 0.18,
            }}
            className={`
            fixed z-90
            bg-card
            border border-border
            shadow-2xl
            rounded-3xl
            overflow-hidden
            flex flex-col
            transition-all duration-300
            ${isExpanded
                ? "inset-6"
                : "bottom-20 right-6 w-[1100px] max-w-[calc(100vw-3rem)] h-[620px]"
              }
          `}
          >
            {/* HEADER */}

            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Activity
                    size={18}
                    className="text-primary"
                  />
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white">
                    System Activity
                  </h3>

                  <p className="text-[11px] text-muted-foreground">
                    Real-time process monitoring
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <div className="mr-3 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Live
                </div>

                <button
                  onClick={() =>
                    setIsExpanded(!isExpanded)
                  }
                  className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground transition-colors"
                >
                  {isExpanded ? (
                    <Minimize2 size={15} />
                  ) : (
                    <Maximize2 size={15} />
                  )}
                </button>

                <button
                  onClick={() => {
                    logger.clear();
                    setLogs([]);
                  }}
                  className="p-2 rounded-xl hover:bg-rose-500/10 hover:text-rose-400 text-muted-foreground transition-colors"
                >
                  <Trash2 size={15} />
                </button>

                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* SEARCH + FILTER */}

            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/5">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />

                <input
                  type="text"
                  placeholder="Search logs..."
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                  className="
                  w-full
                  bg-secondary/30
                  border border-border
                  rounded-xl
                  py-2.5
                  pl-10
                  pr-4
                  text-[12px]
                  outline-none
                  transition-all
                  focus:border-primary/40
                  focus:ring-2
                  focus:ring-primary/10
                  placeholder:text-muted-foreground/40
                "
                />
              </div>

              <div className="flex items-center gap-1 bg-secondary/30 border border-border rounded-xl p-1">
                {[
                  "all",
                  "info",
                  "warn",
                  "error",
                  "success",
                  "debug",
                ].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`
                    px-3 py-1.5
                    rounded-lg
                    text-[10px]
                    font-semibold
                    uppercase
                    tracking-wide
                    transition-all
                    font-mono
                    ${filter === f
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "text-muted-foreground hover:text-white"
                      }
                  `}
                  >
                    {f === "all"
                      ? "ALL"
                      : f.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* TABLE */}

            <div
              ref={scrollRef}
              onScroll={(e) => {
                const target = e.currentTarget;

                const isAtBottom =
                  target.scrollHeight -
                  target.scrollTop <=
                  target.clientHeight + 10;

                setAutoScroll(isAtBottom);
              }}
              className="flex-1 overflow-auto font-mono bg-black/20"
            >
              {/* TABLE HEADER */}

              <div
                className="
                sticky top-0 z-10
                grid
                grid-cols-[100px_100px_minmax(200px,1fr)_120px_180px_100px_120px]
                gap-3
                px-6 py-2
                border-b border-border/60
                bg-card/95
                text-[10px]
                uppercase
                tracking-widest
                text-muted-foreground/40
                font-bold
              "
              >
                <span className="pl-1">Timestamp</span>
                <span>Level</span>
                <span>Message</span>
                <span>Source</span>
                <span>Model</span>
                <span>Cost</span>
                <span>Output</span>
              </div>

              {/* EMPTY */}

              {filteredLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground/30">
                  <Terminal
                    size={40}
                    strokeWidth={1}
                  />

                  <p className="text-[10px] uppercase tracking-[0.3em]">
                    No activity recorded
                  </p>
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <LogItem
                    key={log.id}
                    log={log}
                  />
                ))
              )}
            </div>

            {/* SUMMARY SECTION (TERMINAL STYLE) */}

            {/* SUMMARY SECTION (TERMINAL STYLE - ENHANCED READABILITY) */}

            {logs.length > 0 && (
              <div className="px-8 py-5 border-t border-border/40 bg-black/60 font-mono text-[13px] flex items-center justify-between overflow-hidden whitespace-nowrap">
                <div className="flex items-center gap-10">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground/20 font-bold tracking-widest">[SESSION_REPORT]</span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground/40 text-[9px] uppercase tracking-widest">Consumption</span>
                    <span className="text-primary font-black text-base">{summary.totalTokens.toLocaleString()}<span className="text-[10px] ml-1 opacity-50 uppercase">tk</span></span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground/40 text-[9px] uppercase tracking-widest">Duration</span>
                    <span className="text-sky-400 font-black text-base">{summary.totalDuration.toFixed(1)}<span className="text-[10px] ml-1 opacity-50 uppercase">sec</span></span>
                  </div>

                  <div className="flex flex-col gap-0.5 border-l border-white/5 pl-10">
                    <span className="text-muted-foreground/40 text-[9px] uppercase tracking-widest">Performance</span>
                    <span className="text-amber-400 font-black text-base">{avgTokensPerSec}<span className="text-[10px] ml-1 opacity-50 uppercase">t/s</span></span>
                  </div>

                  {summary.totalCost > 0 && (
                    <div className="flex flex-col gap-0.5 border-l border-white/5 pl-10">
                      <span className="text-muted-foreground/40 text-[9px] uppercase tracking-widest">Expense</span>
                      <span className="text-emerald-400 font-black text-base">${summary.totalCost.toFixed(4)}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-muted-foreground/40 text-[9px] uppercase tracking-widest">Session Health</span>
                  <div className="flex items-center gap-3 font-black text-base">
                    <span className="text-emerald-400">{summary.successCount} <span className="text-[10px] opacity-50 uppercase">OK</span></span>
                    {summary.errorCount > 0 && (
                      <>
                        <span className="text-muted-foreground/20">/</span>
                        <span className="text-rose-400">{summary.errorCount} <span className="text-[10px] opacity-50 uppercase">ERR</span></span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* FOOTER */}

            <div className="px-4 py-2 border-t border-border bg-secondary/10 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`
                    w-2 h-2 rounded-full
                    ${autoScroll
                        ? "bg-primary animate-pulse"
                        : "bg-muted"
                      }
                  `}
                  />

                  <span>
                    {autoScroll
                      ? "Auto-scroll On"
                      : "Auto-scroll Off"}
                  </span>
                </div>

                <span>
                  {filteredLogs.length} Entries
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span>Provider:</span>

                <span className="text-primary">
                  Connected
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function LogItem({
  log,
}: {
  log: LogEntry;
}) {
  const details = log.details || {};

  const provider = details.provider;
  const imageMode = details.imageMode;
  const model = details.model;
  const imageSize = details.imageSize;
  const tokens = details.tokens || details.total_tokens;
  const cost = details.cost ?? details.total_cost;
  const duration = details.duration;
  const status = details.status;

  const levelStyles: Record<string, { text: string; bg: string; border: string; accent: string }> = {
    info: { text: "text-sky-400", bg: "bg-sky-400/10", border: "border-sky-400/20", accent: "bg-sky-400" },
    warn: { text: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20", accent: "bg-amber-400" },
    error: { text: "text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/20", accent: "bg-rose-400" },
    success: { text: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", accent: "bg-emerald-400" },
    debug: { text: "text-slate-400", bg: "bg-slate-400/10", border: "border-slate-400/20", accent: "bg-slate-400" },
  };

  const style = levelStyles[log.level] || levelStyles.info;



  return (
    <div
      className="
      relative
      grid
      grid-cols-[100px_100px_minmax(200px,1fr)_120px_180px_100px_120px]
      items-center
      gap-3
      px-6
      py-1.5
      border-b border-border/20
      hover:bg-primary/5
      transition-colors
      text-[11px]
      group
      font-mono
    "
    >
      {/* VERTICAL BAR */}
      <div className={`absolute left-0 top-0 bottom-0 w-[2px] transition-all group-hover:w-[4px] ${style.accent}`} />

      {/* TIME */}

      <div className="text-muted-foreground/40 font-mono pl-1">
        [{log.timestamp.toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}]
      </div>

      {/* LEVEL TAG */}

      <div
        className={`
        flex items-center gap-1.5
        font-bold text-[10px] tracking-tighter
        ${style.text}
      `}
      >
        <span>
          [{log.level.toUpperCase()}]
        </span>
      </div>

      {/* MESSAGE */}

      <div className="truncate text-foreground/80">
        {log.message}
      </div>

      {/* SOURCE / METHOD */}
      <div className="truncate text-muted-foreground/60 italic flex items-center gap-1">
        <span>{provider || "system"}</span>
        {imageMode && <span className="opacity-40 text-[9px] font-bold px-1.5 py-0.5 bg-white/5 rounded">/ {imageMode}</span>}
      </div>

      {/* MODEL */}

      <div className="truncate text-primary/60">
        {model ? `> ${model}` : "—"}
      </div>

      {/* COST */}
      <div className="truncate text-emerald-400/80 font-bold">
        {typeof cost === 'number' ? `$${cost.toFixed(5)}` : "—"}
      </div>

      {/* OUTPUT DETAILS */}

      <div className="truncate text-muted-foreground/50">
        {tokens && `${tokens}tk`}
        {tokens && duration && "::"}
        {typeof duration === "number" ? `${duration.toFixed(2)}s` : duration}
        {!tokens && !duration && imageSize}
        {!tokens && !duration && !imageSize && status}
      </div>
    </div>
  );
}