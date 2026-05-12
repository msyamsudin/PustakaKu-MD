import type { ExtractionResult } from "../api";

// Prices per 1M tokens (USD)
const PRICES: Record<string, { in: number; out: number }> = {
  "openai/gpt-4o": { in: 5, out: 15 },
  "openai/gpt-4-turbo": { in: 10, out: 30 },
  "anthropic/claude-3-opus": { in: 15, out: 75 },
  "anthropic/claude-3-sonnet": { in: 3, out: 15 },
  "anthropic/claude-3-haiku": { in: 0.25, out: 1.25 },
  "google/gemini-pro-1.5": { in: 3.5, out: 10.5 },
  "google/gemini-flash-1.5": { in: 0.35, out: 1.05 },
};

export function calculateCost(
  usage: ExtractionResult["usage"],
  model: string
): string | null {
  if (!usage || !model) return null;
  const price = PRICES[model];
  if (!price) return null;
  const cost =
    (usage.prompt_tokens * price.in + usage.completion_tokens * price.out) /
    1_000_000;
  return cost.toFixed(4);
}

export function updateStats(
  result: ExtractionResult,
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
  const existingIndex = statsLog.findIndex(
    (entry) => entry.filename === (fileName || "unknown")
  );

  const newCost =
    config.provider === "openrouter"
      ? Number(calculateCost(result.usage, config.selectedModel))
      : 0;

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
    statsLog[existingIndex] = {
      ...existing,
      timestamp: new Date().toISOString(),
      sessions: [sessionEntry, ...(existing.sessions || [])],
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
      duration: (existing.duration || 0) + duration,
    };
  } else {
    const newEntry = {
      id: Date.now(),
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
