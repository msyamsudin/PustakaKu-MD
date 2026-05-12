import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart3, Clock, DollarSign, Cpu, Trash2, ChevronDown, ChevronUp,
  History, Zap, Timer, TrendingUp, FileText, Download, ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react";

interface Session {
  id: number; timestamp: string; model: string;
  tokens: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  duration: number; cost: number | string;
}
interface LogEntry {
  id: number; filename: string; timestamp: string; provider: string;
  tokens: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  cost: number | string; duration: number; sessions?: Session[];
}

type SortKey = "timestamp" | "tokens" | "cost" | "duration" | "pages";
type SortDir = "asc" | "desc";

export function Statistics() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    const saved = localStorage.getItem("pustakaku-stats");
    if (saved) setLogs(JSON.parse(saved));
  }, []);

  const clearLogs = () => {
    if (confirm("Clear all extraction history?")) {
      localStorage.removeItem("pustakaku-stats");
      setLogs([]);
    }
  };

  const totalSessions = logs.reduce((s, l) => s + (l.sessions?.length || 1), 0);
  const totalTokens = logs.reduce((s, l) => s + l.tokens.total_tokens, 0);
  const totalPrompt = logs.reduce((s, l) => s + (l.tokens.prompt_tokens || 0), 0);
  const totalCompletion = logs.reduce((s, l) => s + (l.tokens.completion_tokens || 0), 0);
  const totalCost = logs.reduce((s, l) => s + (Number(l.cost) || 0), 0);
  const totalDuration = logs.reduce((s, l) => s + (l.duration || 0), 0);
  const avgSpeed = totalSessions > 0 ? totalDuration / totalSessions : 0;
  const maxTokens = Math.max(...logs.map(l => l.tokens.total_tokens), 1);

  const providerCounts = logs.reduce((acc, l) => {
    acc[l.provider] = (acc[l.provider] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredLogs = useMemo(() => {
    let result = filterProvider === "all" ? logs : logs.filter(l => l.provider === filterProvider);
    result = [...result].sort((a, b) => {
      let va = 0, vb = 0;
      if (sortKey === "timestamp") { va = new Date(a.timestamp).getTime(); vb = new Date(b.timestamp).getTime(); }
      else if (sortKey === "tokens") { va = a.tokens.total_tokens; vb = b.tokens.total_tokens; }
      else if (sortKey === "cost") { va = Number(a.cost) || 0; vb = Number(b.cost) || 0; }
      else if (sortKey === "duration") { va = a.duration || 0; vb = b.duration || 0; }
      else if (sortKey === "pages") { va = a.sessions?.length || 1; vb = b.sessions?.length || 1; }
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return result;
  }, [logs, filterProvider, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const exportCSV = () => {
    const header = "File,Provider,Pages,Date,Total Tokens,Prompt Tokens,Completion Tokens,Duration(s),Cost(USD)";
    const rows = logs.map(l => [
      `"${l.filename}"`, l.provider, l.sessions?.length || 1,
      new Date(l.timestamp).toLocaleString(),
      l.tokens.total_tokens, l.tokens.prompt_tokens, l.tokens.completion_tokens,
      (l.duration || 0).toFixed(2),
      l.provider === "ollama" ? "0" : (Number(l.cost) || 0).toFixed(6),
    ].join(",")).join("\n");
    const blob = new Blob([header + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pustakaku-stats-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown size={11} className="opacity-30" />;
    return sortDir === "desc" ? <ArrowDown size={11} className="text-primary" /> : <ArrowUp size={11} className="text-primary" />;
  };

  const summaryCards = [
    {
      icon: Cpu, label: "Documents", color: "text-primary", bg: "bg-primary/10",
      value: String(logs.length),
      sub: `${Object.keys(providerCounts).length} provider(s)`,
    },
    {
      icon: FileText, label: "Pages Extracted", color: "text-blue-400", bg: "bg-blue-500/10",
      value: String(totalSessions),
      sub: logs.length > 0 ? `Avg ${(totalSessions / logs.length).toFixed(1)} pg/doc` : "—",
    },
    {
      icon: BarChart3, label: "Total Tokens", color: "text-violet-400", bg: "bg-violet-500/10",
      value: totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : String(totalTokens),
      sub: `${Math.round(totalPrompt / Math.max(totalTokens, 1) * 100)}% prompt`,
    },
    {
      icon: TrendingUp, label: "Output Ratio", color: "text-amber-400", bg: "bg-amber-500/10",
      value: totalTokens > 0 ? `${Math.round(totalCompletion / Math.max(totalPrompt, 1) * 100)}%` : "—",
      sub: "Completion / Prompt",
    },
    {
      icon: Timer, label: "Avg Speed", color: "text-cyan-400", bg: "bg-cyan-500/10",
      value: avgSpeed > 0 ? `${avgSpeed.toFixed(1)}s` : "—",
      sub: "Per page extraction",
    },
    {
      icon: DollarSign, label: "Est. Cost", color: "text-emerald-400", bg: "bg-emerald-500/10",
      value: `$${totalCost.toFixed(4)}`,
      sub: providerCounts["ollama"] ? `${providerCounts["ollama"]} free via Ollama` : "OpenRouter only",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">Extraction Statistics</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Usage overview across all processed documents</p>
        </div>
        {logs.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border bg-card hover:bg-secondary transition-colors font-medium">
              <Download size={13} /> Export CSV
            </button>
            <button onClick={clearLogs} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-destructive/20 text-destructive hover:bg-destructive/10 transition-colors font-medium">
              <Trash2 size={13} /> Clear All
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {summaryCards.map(({ icon: Icon, label, value, sub, color, bg }) => (
          <div key={label} className="bg-card p-3.5 rounded-xl border border-border flex flex-col gap-2 hover:border-primary/25 transition-colors">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center ${color} shrink-0`}>
              <Icon size={16} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</p>
              <p className="text-xl font-bold tabular-nums leading-tight mt-0.5">{value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {logs.length > 0 && (
        <>
          {/* Token Bar Chart + Breakdown */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            {/* Bar chart */}
            <div className="xl:col-span-2 bg-card rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <BarChart3 size={13} /> Token Usage by File
                </h3>
                <span className="text-[10px] text-muted-foreground">Prompt / Completion</span>
              </div>
              <div className="space-y-2.5">
                {[...logs].sort((a, b) => b.tokens.total_tokens - a.tokens.total_tokens).slice(0, 7).map(log => {
                  const promptPct = (log.tokens.prompt_tokens / maxTokens) * 100;
                  const completionPct = (log.tokens.completion_tokens / maxTokens) * 100;
                  const shortName = log.filename.length > 30 ? log.filename.slice(0, 27) + "…" : log.filename;
                  return (
                    <div key={log.id} className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground w-32 truncate shrink-0" title={log.filename}>{shortName}</span>
                      <div className="flex-1 h-4 bg-secondary/40 rounded-full overflow-hidden flex">
                        <div className="h-full bg-primary/60 transition-all duration-700" style={{ width: `${promptPct}%` }} />
                        <div className="h-full bg-violet-500/60 transition-all duration-700" style={{ width: `${completionPct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums text-muted-foreground w-14 text-right shrink-0">
                        {log.tokens.total_tokens.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm bg-primary/60" />
                  <span className="text-[10px] text-muted-foreground">Prompt tokens</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm bg-violet-500/60" />
                  <span className="text-[10px] text-muted-foreground">Completion tokens</span>
                </div>
              </div>
            </div>

            {/* Provider + Token ratio */}
            <div className="flex flex-col gap-3">
              {/* Provider breakdown */}
              <div className="bg-card rounded-xl border border-border p-4 flex-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                  <Zap size={13} /> Provider Usage
                </h3>
                <div className="space-y-2.5">
                  {Object.entries(providerCounts).map(([provider, count]) => {
                    const pct = Math.round(count / logs.length * 100);
                    return (
                      <div key={provider}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold uppercase">{provider}</span>
                          <span className="text-[10px] text-muted-foreground">{count} doc(s) — {pct}%</span>
                        </div>
                        <div className="h-2 bg-secondary/40 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${provider === "ollama" ? "bg-emerald-500" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Token I/O ratio */}
              <div className="bg-card rounded-xl border border-border p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                  <BarChart3 size={13} /> Token I/O Ratio
                </h3>
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 shrink-0">
                    <div
                      className="w-16 h-16 rounded-full"
                      style={{
                        background: totalTokens > 0
                          ? `conic-gradient(hsl(var(--primary)) 0% ${Math.round(totalPrompt / totalTokens * 100)}%, rgb(139 92 246) ${Math.round(totalPrompt / totalTokens * 100)}% 100%)`
                          : "hsl(var(--secondary))"
                      }}
                    />
                    <div className="absolute inset-[22%] rounded-full bg-card flex items-center justify-center">
                      <span className="text-[8px] font-bold text-muted-foreground">I/O</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <div>
                      <span className="text-[10px] text-muted-foreground">Prompt</span>
                      <p className="text-xs font-bold text-primary">{totalPrompt.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground">Completion</span>
                      <p className="text-xs font-bold text-violet-400">{totalCompletion.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* History Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex justify-between items-center gap-3 flex-wrap">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Clock size={13} /> Extraction History
          </h3>
          <div className="flex items-center gap-1.5">
            {["all", ...Object.keys(providerCounts)].map(p => (
              <button
                key={p}
                onClick={() => setFilterProvider(p)}
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide transition-colors ${
                  filterProvider === p ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-secondary/30 text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3 w-8" />
                <th className="p-3 text-[11px] font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("timestamp")}>
                  <span className="flex items-center gap-1">Date <SortIcon k="timestamp" /></span>
                </th>
                <th className="p-3 text-[11px] font-semibold">File</th>
                <th className="p-3 text-[11px] font-semibold">Provider</th>
                <th className="p-3 text-[11px] font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("pages")}>
                  <span className="flex items-center gap-1">Pages <SortIcon k="pages" /></span>
                </th>
                <th className="p-3 text-[11px] font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("tokens")}>
                  <span className="flex items-center gap-1">Tokens <SortIcon k="tokens" /></span>
                </th>
                <th className="p-3 text-[11px] font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("duration")}>
                  <span className="flex items-center gap-1">Duration <SortIcon k="duration" /></span>
                </th>
                <th className="p-3 text-[11px] font-semibold text-right cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("cost")}>
                  <span className="flex items-center justify-end gap-1">Cost <SortIcon k="cost" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-muted-foreground text-sm italic">
                    {logs.length === 0 ? "No extraction history yet." : "No results for this filter."}
                  </td>
                </tr>
              ) : filteredLogs.map(log => (
                <React.Fragment key={log.id}>
                  <tr
                    className={`hover:bg-secondary/20 transition-colors cursor-pointer ${expandedId === log.id ? "bg-secondary/10" : ""}`}
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <td className="p-3 text-muted-foreground">
                      {expandedId === log.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-xs truncate max-w-[160px]" title={log.filename}>{log.filename}</span>
                        <div className="h-1 w-20 bg-secondary/40 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(log.tokens.total_tokens / maxTokens) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`uppercase text-[10px] font-bold px-2 py-0.5 rounded ${
                        log.provider === "ollama" ? "bg-emerald-500/15 text-emerald-400" : "bg-primary/10 text-primary"
                      }`}>
                        {log.provider}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-semibold tabular-nums">{log.sessions?.length ?? 1}</td>
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs tabular-nums">{log.tokens.total_tokens.toLocaleString()}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {log.tokens.prompt_tokens.toLocaleString()} / {log.tokens.completion_tokens.toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground tabular-nums">{log.duration ? `${log.duration.toFixed(1)}s` : "—"}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={`font-mono text-xs font-semibold ${log.provider === "ollama" ? "text-emerald-400" : "text-amber-400"}`}>
                          {log.provider === "ollama" ? "FREE" : `$${Number(log.cost).toFixed(4)}`}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete history for ${log.filename}?`)) {
                              const newLogs = logs.filter(l => l.id !== log.id);
                              setLogs(newLogs); localStorage.setItem("pustakaku-stats", JSON.stringify(newLogs));
                            }
                          }}
                          className="p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-colors text-muted-foreground"
                          title="Delete Entry"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === log.id && log.sessions && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <div className="mx-6 my-3 p-4 rounded-lg bg-secondary/20 border border-border space-y-2">
                          <h4 className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5 tracking-wider mb-2">
                            <History size={11} /> {log.sessions.length} Session{log.sessions.length !== 1 ? "s" : ""}
                          </h4>
                          <div className="grid grid-cols-5 gap-3 text-[10px] font-bold border-b border-border pb-1.5 text-muted-foreground uppercase tracking-wider">
                            <span>Time</span><span>Model</span><span>Tokens (in/out)</span><span>Duration</span><span className="text-right">Cost</span>
                          </div>
                          {log.sessions.map(s => (
                            <div key={s.id} className="grid grid-cols-5 gap-3 text-xs items-center py-1.5 border-b border-border/40 last:border-0">
                              <span className="text-muted-foreground text-[10px]">{new Date(s.timestamp).toLocaleTimeString()}</span>
                              <span className="truncate font-mono bg-background px-1.5 py-0.5 rounded border border-border text-[10px]">{s.model}</span>
                              <span className="text-[10px]">
                                <span className="font-bold">{s.tokens.total_tokens.toLocaleString()}</span>
                                <span className="opacity-50 ml-1">({s.tokens.prompt_tokens}/{s.tokens.completion_tokens})</span>
                              </span>
                              <span className="text-primary tabular-nums text-[10px]">{s.duration.toFixed(2)}s</span>
                              <span className={`text-right font-mono text-[10px] font-semibold ${log.provider === "ollama" ? "text-emerald-400" : "text-amber-400"}`}>
                                {log.provider === "ollama" ? "FREE" : `$${Number(s.cost).toFixed(4)}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
