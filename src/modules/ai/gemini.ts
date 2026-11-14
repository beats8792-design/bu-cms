import { serverEnv } from "@/lib/env";

/**
 * Gemini client (Phase 9, UCM-A1–A4; provider swap 2026-11-14) — zero-dependency
 * `fetch` against the Google Generative Language REST API. The owner moved from
 * OpenRouter to the direct Gemini API since `GEMINI_API_KEY` was already
 * provisioned (Brain/LOG 2026-11-14).
 *
 *   chat  → POST /v1beta/models/{model}:generateContent
 *   embed → POST /v1beta/models/{model}:batchEmbedContents
 *
 * Defaults; override via env:
 *   GEMINI_MODEL            (default gemini-3.8-flash)
 *   GEMINI_EMBEDDING_MODEL  (default gemini-embedding-001)
 *
 * All failures surface as `AiError` with a *friendly* message — AI problems
 * must never read like stack traces in the UI (ARCHITECTURE.md §6).
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 90_000;

export function chatModel(): string {
  return serverEnv().GEMINI_MODEL || "gemini-3.8-flash";
}

export function embeddingModel(): string {
  return serverEnv().GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
}

export function aiConfigured(): boolean {
  return serverEnv().services.gemini;
}

/** Friendly AI failure — status is an HTTP-ish hint for route handlers. */
export class AiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}

function headers(): Record<string, string> {
  const env = serverEnv();
  if (!env.services.gemini) {
    throw new AiError(
      "AI features are not configured yet — add GEMINI_API_KEY to the environment.",
      503,
    );
  }
  return {
    "x-goog-api-key": env.GEMINI_API_KEY as string,
    "Content-Type": "application/json",
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiError("The AI took too long to respond — try again in a moment.", 504);
    }
    throw new AiError("Could not reach the AI service — check the connection and try again.", 502);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (
      res.status === 401 ||
      res.status === 403 ||
      (res.status === 400 && /api key/i.test(detail))
    ) {
      throw new AiError("The AI key was rejected — ask the admin to check GEMINI_API_KEY.", 503);
    }
    if (res.status === 429) {
      throw new AiError("The AI service is rate-limited right now — try again in a minute.", 429);
    }
    console.error(`[gemini:${path}] ${res.status}`, detail.slice(0, 400));
    throw new AiError("The AI service had a problem — try again in a moment.", res.status >= 500 ? 502 : 400);
  }
  return (await res.json()) as T;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** One chat completion. `json = true` asks the model to answer with raw JSON. */
export async function chat(
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  type ChatResponse = {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  // Thinking models (2.5 & 3.x series) reason by default and can burn the whole
  // output budget on reasoning (empty answer + MAX_TOKENS). Disable it for
  // these deterministic RAG/JSON tasks; only sent for those series since
  // older models reject the field.
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.4,
    maxOutputTokens: opts.maxTokens ?? 2000,
    ...(opts.json ? { responseMimeType: "application/json" } : {}),
  };
  if (/2\.5|^gemini-3/.test(chatModel())) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const data = await post<ChatResponse>(`/models/${chatModel()}:generateContent`, {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig,
  });

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) {
    if (candidate?.finishReason && /SAFETY|BLOCK|PROHIBITED/i.test(candidate.finishReason)) {
      throw new AiError(
        "The AI declined to answer this one — try rephrasing your question.",
        400,
      );
    }
    throw new AiError("The AI returned an empty answer — try rephrasing your question.", 502);
  }
  return text;
}

/** Embed a batch of texts (Gemini batchEmbedContents). */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  type EmbedResponse = {
    embeddings?: Array<{ values?: number[] }>;
  };
  const model = embeddingModel();
  const data = await post<EmbedResponse>(`/models/${model}:batchEmbedContents`, {
    requests: texts.map((t) => ({
      model: `models/${model}`,
      content: { parts: [{ text: t }] },
    })),
  });
  const vectors = (data.embeddings ?? []).map((e) => e.values ?? []);
  if (vectors.length !== texts.length || vectors.some((v) => v.length === 0)) {
    throw new AiError("The AI service returned incomplete vectors — try reindexing later.", 502);
  }
  return vectors;
}

/**
 * Models occasionally wrap JSON in markdown fences or prose. Extract the first
 * balanced JSON object/array and parse it. Returns null when nothing parses.
 */
export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) return null;
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
