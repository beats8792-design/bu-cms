import { serverEnv } from "@/lib/env";

/**
 * OpenRouter client (Phase 9, UCM-A1–A4) — zero-dependency `fetch` against the
 * OpenAI-compatible REST API. The owner picked OpenRouter over direct Gemini
 * (Brain/LOG Phase 9): one key, any model, embeddings included.
 *
 *   chat  → POST /api/v1/chat/completions
 *   embed → POST /api/v1/embeddings
 *
 * Defaults are deliberately cheap models; override via env:
 *   OPENROUTER_MODEL             (default google/gemini-2.5-flash)
 *   OPENROUTER_EMBEDDING_MODEL   (default openai/text-embedding-3-small, 1536-d)
 *
 * All failures surface as `AiError` with a *friendly* message — AI problems
 * must never read like stack traces in the UI (ARCHITECTURE.md §6).
 */

const BASE_URL = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 90_000;

export function chatModel(): string {
  return serverEnv().OPENROUTER_MODEL || "google/gemini-2.5-flash";
}

export function embeddingModel(): string {
  return serverEnv().OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";
}

export function aiConfigured(): boolean {
  return serverEnv().services.openrouter;
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
  if (!env.services.openrouter) {
    throw new AiError(
      "AI features are not configured yet — add OPENROUTER_API_KEY to the environment.",
      503,
    );
  }
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
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
    if (res.status === 401 || res.status === 403) {
      throw new AiError("The AI key was rejected — ask the admin to check OPENROUTER_API_KEY.", 503);
    }
    if (res.status === 429) {
      throw new AiError("The AI service is rate-limited right now — try again in a minute.", 429);
    }
    console.error(`[openrouter:${path}] ${res.status}`, detail.slice(0, 400));
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
    choices?: Array<{ message?: { content?: string } }>;
  };
  const data = await post<ChatResponse>("/chat/completions", {
    model: chatModel(),
    messages,
    max_tokens: opts.maxTokens ?? 2000,
    temperature: opts.temperature ?? 0.4,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError("The AI returned an empty answer — try rephrasing your question.", 502);
  return text;
}

/** Embed a batch of texts (OpenRouter embeddings endpoint, OpenAI shape). */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  type EmbedResponse = {
    data?: Array<{ embedding?: number[] }>;
  };
  const data = await post<EmbedResponse>("/embeddings", {
    model: embeddingModel(),
    input: texts,
  });
  const vectors = (data.data ?? []).map((d) => d.embedding ?? []);
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
