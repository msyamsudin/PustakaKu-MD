import { fetch } from "@tauri-apps/plugin-http";
import { logger } from "./logger";

export type Provider = "ollama" | "openrouter" | "google";

interface ExtractionOptions {
  provider: Provider;
  openRouterKey?: string;
  ollamaUrl?: string;
  googleApiKey?: string;
  model: string;
  base64Image: string;
  imageInputMode?: "base64" | "supabase" | "google_files"; // default: "base64"
  imageUrl?: string;                       // pre-generated signed URL (Supabase mode)
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
}

const SYSTEM_PROMPT = `You are an expert at extracting text and structure from images.
Your goal is to convert the image into a high-quality Markdown document.

### CHARTS & DIAGRAMS
If you see any chart, graph, or diagram, you MUST provide:
1. A detailed textual summary and description of the data, trends, and logic shown in the graphic.
2. An image crop immediately after: \`![Alt](crop:PAGE:ymin,xmin,ymax,xmax)\`

### GENERAL RULES
- **Text & Tables**: Extract as plain Markdown. Never use crops for text or tables.
- **Photos & Illustrations**: Use image crops: \`![Alt](crop:PAGE:ymin,xmin,ymax,xmax)\`
- **Coordinates**: Use 0-1000 scale. Format: ymin,xmin,ymax,xmax.

### OUTPUT FORMAT
- **CRITICAL**: Do NOT include any "thinking", "planning", or "analysis" steps in your output.
- **CRITICAL**: Start your response immediately with the Markdown content. 
- **CRITICAL**: Do NOT include any conversational filler like "Here is the extraction" or "Okay, I will do that".
- Just output the final Markdown.`;

export interface ExtractionResult {
  markdown: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  capabilities: {
    vision: boolean;
  };
}

/**
 * Helper to retry an async function with exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (error.name === 'AbortError') {
        throw error;
      }
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        logger.warn(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`, { error: error.message || error });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Helper to read a stream with an inactivity timeout.
 * Resets the timer whenever new data is received.
 */
async function readStream(
  response: Response,
  onChunk?: (text: string) => void,
  inactivityTimeoutMs = 30000
): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let timeoutId: any;

  const resetInactivityTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      logger.warn(`[API] Inactivity timeout after ${inactivityTimeoutMs}ms`);
      reader.cancel("Inactivity timeout");
    }, inactivityTimeoutMs);
  };

  try {
    resetInactivityTimeout();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      resetInactivityTimeout(); // Reset timer on data

      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;

      if (onChunk) {
        onChunk(chunk);
      }
    }
    return fullText;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function extractMarkdown(options: ExtractionOptions): Promise<ExtractionResult> {
  return withRetry<ExtractionResult>(async () => {
    const { provider, model, base64Image, imageInputMode, imageUrl } = options;

    const useSupabase = imageInputMode === "supabase" && !!imageUrl;

    logger.info(`Starting extraction`, {
      provider,
      model,
      imageMode: useSupabase ? "supabase-url" : "base64",
      ...(useSupabase ? {} : {
        imageSize: `${(base64Image.length / 1024).toFixed(1)} KB`,
        mimeType: base64Image.includes('data:') ? base64Image.split('data:')[1].split(';')[0] : 'image/jpeg'
      }),
    });

    const base64Data = (base64Image.includes('base64,')
      ? base64Image.split('base64,')[1]
      : base64Image).replace(/\s/g, '');

    const mimeType = base64Image.includes('data:')
      ? base64Image.split('data:')[1].split(';')[0]
      : 'image/jpeg';

    const startTime = performance.now();

    if (provider === "ollama") {
      const url = options.ollamaUrl?.replace(/\/$/, '') || "http://localhost:11434";
      const response = await fetch(`${url}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model || "llava:latest",
          prompt: SYSTEM_PROMPT,
          images: [base64Data],
          stream: true // Enable streaming
        }),
        signal: options.signal
      });

      logger.debug(`Ollama response received`, { status: response.status, ok: response.ok });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText} (${response.status})`);
      }

      let accumulatedMarkdown = "";
      let usage: any = undefined;
      let buffer = "";

      await readStream(response, (rawChunk) => {
        buffer += rawChunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // Keep the last (potentially incomplete) line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.response) {
              accumulatedMarkdown += parsed.response;
              if (options.onChunk) options.onChunk(parsed.response);
            }
            if (parsed.done) {
              const totalTokens = (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0);
              const durationSec = parsed.total_duration / 1e9;

              logger.success(`Extraction complete (Ollama)`, {
                provider: "Ollama",
                model,
                tokens: totalTokens,
                duration: durationSec
              });

              usage = parsed.prompt_eval_count ? {
                prompt_tokens: parsed.prompt_eval_count,
                completion_tokens: parsed.eval_count,
                total_tokens: totalTokens
              } : undefined;
            }
          } catch (e) {
            // If it fails, maybe it's still partial, but pop() should handle most cases
          }
        }
      });

      return {
        markdown: accumulatedMarkdown,
        usage
      };
    } else if (provider === "openrouter") {
      const imageContent = useSupabase
        ? { type: "image_url", image_url: { url: imageUrl! } }
        : { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } };

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${options.openRouterKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model || "google/gemini-pro-vision",
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT
            },
            {
              role: "user",
              content: [
                imageContent,
              ]
            }
          ]
        }),
        signal: options.signal
      });

      logger.debug(`OpenRouter response received`, { status: response.status, ok: response.ok });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${err.error?.message || response.statusText} (${response.status})`);
      }

      let accumulatedMarkdown = "";
      let usage: any = undefined;
      let buffer = "";

      const processLines = (text: string) => {
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // Keep partial line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const dataStr = trimmed.replace('data: ', '');
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.choices?.[0]?.delta?.content || "";
            if (content) {
              accumulatedMarkdown += content;
              if (options.onChunk) options.onChunk(content);
            }
            if (parsed.usage) {
              // OpenRouter sometimes uses total_cost, sometimes cost
              const currentUsage = parsed.usage;
              const extractedCost = currentUsage.total_cost ?? currentUsage.cost ?? currentUsage.total_cost_usd;

              usage = {
                ...usage,
                ...currentUsage,
                // Ensure cost is explicitly set in a consistent field if found
                total_cost: extractedCost
              };

              logger.debug(`[OpenRouter] Usage updated`, {
                tokens: usage.total_tokens,
                cost: extractedCost
              });
            }
          } catch (e) {
            // Partial JSON
          }
        }
      };

      await readStream(response, processLines);

      // Process any remaining data in the buffer (often contains the final usage chunk)
      if (buffer.trim()) {
        processLines('\n'); // Add a newline to force the last line to be processed
      }

      const durationSec = (performance.now() - startTime) / 1000;
      logger.success(`Extraction complete (OpenRouter)`, {
        provider: "OpenRouter",
        model,
        tokens: usage?.total_tokens,
        cost: usage?.total_cost ?? usage?.cost, // Try both
        duration: durationSec
      });

      return {
        markdown: accumulatedMarkdown,
        usage
      };
    } else if (provider === "google") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-1.5-flash"}:streamGenerateContent?key=${options.googleApiKey}&alt=sse`;

      let imagePart: any;

      if (imageInputMode === "google_files") {
        if (options.imageUrl) {
          // Pre-uploaded URI provided (e.g. from benchmark — skip re-upload)
          logger.debug(`[Google] Using pre-uploaded Files API URI`, { uri: options.imageUrl });
          imagePart = {
            fileData: {
              mimeType,
              fileUri: options.imageUrl
            }
          };
        } else {
          // Standard path: upload from base64
          logger.info(`[Google] Uploading image to Google Files API...`);
          const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${options.googleApiKey}`;

          const blob = await fetch(`data:${mimeType};base64,${base64Data}`).then(r => r.blob());

          const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'X-Goog-Upload-Protocol': 'raw',
              'X-Goog-Upload-Command': 'start, upload, finalize',
              'X-Goog-Upload-Header-Content-Length': blob.size.toString(),
              'X-Goog-Upload-Header-Content-Type': mimeType,
              'Content-Type': mimeType,
            },
            body: blob
          });

          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({}));
            throw new Error(`Google Files API error: ${err.error?.message || uploadRes.statusText} (${uploadRes.status})`);
          }

          const uploadData = await uploadRes.json();
          let fileObj = uploadData.file;

          // Wait until the file is ACTIVE
          while (fileObj.state === 'PROCESSING') {
            logger.info(`[Google] File ${fileObj.name} is PROCESSING, waiting 1s...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileObj.name}?key=${options.googleApiKey}`);
            if (!checkRes.ok) {
              throw new Error(`Failed to check file status: ${checkRes.statusText}`);
            }
            fileObj = await checkRes.json();
          }

          if (fileObj.state === 'FAILED') {
            throw new Error(`Google Files API error: File processing failed.`);
          }

          imagePart = {
            fileData: {
              mimeType: fileObj.mimeType,
              fileUri: fileObj.uri
            }
          };
          logger.debug(`[Google] Image uploaded successfully`, { uri: fileObj.uri, state: fileObj.state });
        }
      } else {
        imagePart = { inlineData: { mimeType, data: base64Data } };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: [{
            role: "user",
            parts: [
              imagePart
            ]
          }]
        }),
        signal: options.signal
      });

      logger.debug(`Google AI Studio response received`, { status: response.status, ok: response.ok });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Google API error: ${err.error?.message || response.statusText} (${response.status})`);
      }

      let accumulatedMarkdown = "";
      let usage: any = undefined;
      let buffer = "";

      const processLines = (text: string) => {
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // Keep partial line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const dataStr = trimmed.replace('data: ', '');
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (content) {
              accumulatedMarkdown += content;
              if (options.onChunk) options.onChunk(content);
            }
            if (parsed.usageMetadata) {
              usage = {
                prompt_tokens: parsed.usageMetadata.promptTokenCount,
                completion_tokens: parsed.usageMetadata.candidatesTokenCount,
                total_tokens: parsed.usageMetadata.totalTokenCount
              };
              logger.debug(`[Google] Usage updated`, { tokens: usage.total_tokens });
            }
          } catch (e) {
            // Partial JSON
          }
        }
      };

      await readStream(response, processLines);

      if (buffer.trim()) {
        processLines('\n');
      }

      const durationSec = (performance.now() - startTime) / 1000;
      logger.success(`Extraction complete (Google AI Studio)`, {
        provider: "Google",
        model,
        tokens: usage?.total_tokens,
        duration: durationSec
      });

      return {
        markdown: accumulatedMarkdown,
        usage
      };
    }

    throw new Error("Invalid provider");
  });
}

export async function fetchModels(provider: Provider, config: { openRouterKey?: string; ollamaUrl?: string; googleApiKey?: string }): Promise<ModelInfo[]> {
  if (provider === "ollama") {
    const url = config.ollamaUrl?.replace(/\/$/, '') || "http://localhost:11434";
    const response = await fetch(`${url}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to fetch Ollama models: ${response.statusText}`);
    }
    const data = await response.json();
    return data.models.map((m: any) => ({
      id: m.name,
      name: m.name,
      capabilities: {
        // Ollama officially marks vision models with 'clip' in the families field
        vision: m.details?.families?.includes("clip")
      }
    }));
  }

  if (provider === "openrouter") {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${config.openRouterKey}`,
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenRouter models: ${response.statusText}`);
    }
    const data = await response.json();
    return data.data.map((m: any) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      contextLength: m.context_length,
      capabilities: {
        // OpenRouter provides explicit modality information
        vision: m.architecture?.modality === "multimodal" || 
                m.architecture?.modality?.includes("image")
      }
    }));
  }

  if (provider === "google") {
    const key = config.googleApiKey?.trim();
    if (!key) throw new Error("Google API Key is required");
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Google API error: ${err.error?.message || response.statusText} (${response.status})`);
    }
    const data = await response.json();
    return data.models
      .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: any) => {
        const id = m.name.replace('models/', '');
        return {
          id,
          name: m.displayName || id,
          description: m.description,
          contextLength: m.inputTokenLimit,
          capabilities: {
            // Google v1beta API list doesn't provide an explicit vision flag
            vision: false
          }
        };
      });
  }

  return [];
}
