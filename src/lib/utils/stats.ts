import type { ExtractionResult } from "../api";

export function updateStats(
  result: ExtractionResult,
  filePath: string,
  fileName: string,
  duration: number
): void {
  if (!result.usage) return;

  const savedSettings = localStorage.getItem("pustakaku-settings");
  if (!savedSettings) return;
  const config = JSON.parse(savedSettings);

  const statsLog: any[] = JSON.parse(
    localStorage.getItem("pustakaku-stats") || "[]"
  );
  
  // Group by path for uniqueness, fallback to filename
  const existingIndex = statsLog.findIndex(
    (entry) => (entry.path && entry.path === filePath) || entry.filename === (fileName || "unknown")
  );

  const newCost = result.cost || 0;

  const sessionEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    model: config.selectedModel,
    tokens: result.usage,
    duration: duration,
    cost: newCost,
  };

  if (existingIndex !== -1) {
    const existing = statsLog[existingIndex];
    const allSessions = [sessionEntry, ...(existing.sessions || [])];
    
    // Calculate merged duration (union of intervals)
    const intervals = allSessions.map(s => {
      const end = new Date(s.timestamp).getTime();
      const start = end - (s.duration * 1000);
      return { start, end };
    });
    
    intervals.sort((a, b) => a.start - b.start);
    
    let mergedMs = 0;
    if (intervals.length > 0) {
      let currentStart = intervals[0].start;
      let currentEnd = intervals[0].end;
      
      for (let i = 1; i < intervals.length; i++) {
        if (intervals[i].start < currentEnd) {
          currentEnd = Math.max(currentEnd, intervals[i].end);
        } else {
          mergedMs += currentEnd - currentStart;
          currentStart = intervals[i].start;
          currentEnd = intervals[i].end;
        }
      }
      mergedMs += currentEnd - currentStart;
    }
    
    const newMergedDuration = mergedMs / 1000;

    statsLog[existingIndex] = {
      ...existing,
      path: filePath, // Ensure path is stored
      filename: fileName,
      timestamp: new Date().toISOString(),
      sessions: allSessions,
      tokens: {
        prompt_tokens:
          (existing.tokens?.prompt_tokens || 0) + result.usage.prompt_tokens,
        completion_tokens:
          (existing.tokens?.completion_tokens || 0) +
          result.usage.completion_tokens,
        total_tokens:
          (existing.tokens?.total_tokens || 0) + result.usage.total_tokens,
      },
      cost: (Number(existing.cost) || 0) + newCost,
      duration: newMergedDuration,
    };
  } else {
    const newEntry = {
      id: Date.now(),
      path: filePath,
      filename: fileName || "unknown",
      timestamp: new Date().toISOString(),
      provider: config.provider,
      tokens: result.usage,
      cost: newCost,
      duration: duration,
      sessions: [sessionEntry],
    };
    statsLog.unshift(newEntry);
  }

  localStorage.setItem("pustakaku-stats", JSON.stringify(statsLog.slice(0, 100)));
}
