/**
 * LoopDetectedError is a custom error thrown when an AI generation loop is identified.
 */
export class LoopDetectedError extends Error {
  constructor(message = "Ekstraksi dihentikan secara otomatis karena model mendeteksi perulangan tanpa henti (looping).") {
    super(message);
    this.name = "LoopDetectedError";
    // Restore prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface LoopDiagnostics {
  isLooping: boolean;
  lzwRatio: number;
  reason?: string;
  hasEnoughData: boolean;
}

/**
 * Analyzes the given text for generation loops and provides detailed real-time diagnostics.
 */
export function analyzeAiResponseLoop(text: string, minLength = 120): LoopDiagnostics {
  const len = text.length;
  let lzwRatio = 1.0;
  const hasEnoughData = len >= minLength;

  // LZW Compression Ratio Calculation (measures vocabulary and structural redundancy)
  if (len > 0) {
    const s = text;
    const dict: Record<string, number> = {};
    const data = (s + "").split("");
    const out: number[] = [];
    let phrase = data[0];
    let code = 256;

    for (let i = 1; i < data.length; i++) {
      const currChar = data[i];
      if (dict[phrase + currChar] != null) {
        phrase += currChar;
      } else {
        out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
        dict[phrase + currChar] = code;
        code++;
        phrase = currChar;
      }
    }
    out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
    lzwRatio = out.length / s.length;
  }

  // Guard 1: Adjacent Repetition Matching (measures character, word, or sentence repetition)
  for (let patternLen = 1; patternLen <= 60; patternLen++) {
    if (len < patternLen * 2) break;

    const chunk1 = text.substring(len - patternLen);
    const chunk2 = text.substring(len - patternLen * 2, len - patternLen);

    if (chunk1 === chunk2) {
      if (patternLen === 1) {
        // Single character repeat (e.g., "aaaaaa...")
        if (len >= 8) {
          const last8 = text.substring(len - 8);
          if (last8 === chunk1.repeat(8)) {
            return { isLooping: true, lzwRatio, reason: `Char Repeat ("${chunk1}")`, hasEnoughData };
          }
        }
      } else if (patternLen === 2) {
        // Short pattern repeat (e.g., "a a a a ...")
        if (len >= 10) {
          const last10 = text.substring(len - 10);
          if (last10 === chunk1.repeat(5)) {
            return { isLooping: true, lzwRatio, reason: `Short Repeat ("${chunk1}")`, hasEnoughData };
          }
        }
      } else if (patternLen >= 3 && patternLen <= 8) {
        // Medium pattern repeat (e.g., "abcabcabc")
        if (len >= patternLen * 3) {
          const lastMultiple = text.substring(len - patternLen * 3);
          if (lastMultiple === chunk1.repeat(3)) {
            return { isLooping: true, lzwRatio, reason: `Pattern Repeat ("${chunk1}")`, hasEnoughData };
          }
        }
      } else {
        // Long pattern repeat (e.g., repeating a markdown table row or a phrase)
        // Clean special characters for UI rendering
        const cleanSnippet = chunk1.length > 15 ? chunk1.substring(0, 12) + "..." : chunk1;
        const normalizedSnippet = cleanSnippet.replace(/\s+/g, ' ');
        return { isLooping: true, lzwRatio, reason: `Phrase Repeat ("${normalizedSnippet}")`, hasEnoughData };
      }
    }
  }

  // Guard 2: Low Entropy / High Redundancy over a larger text segment
  if (hasEnoughData && lzwRatio < 0.16) {
    return { isLooping: true, lzwRatio, reason: `Redundancy (${(lzwRatio * 100).toFixed(0)}% Density)`, hasEnoughData };
  }

  return { isLooping: false, lzwRatio, hasEnoughData };
}

/**
 * Legacy compatibility wrapper for isAiResponseLooping.
 */
export function isAiResponseLooping(text: string): boolean {
  return analyzeAiResponseLoop(text).isLooping;
}
