import { GoogleGenAI } from "@google/genai";
import { serverEnv } from "@/lib/env";

/**
 * Gemini ("Google GenAI" unified SDK) wrapper.
 * Phase 0 wires configuration only; embeddings/RAG arrive in Phase 9 on top
 * of these primitives.
 */

export const GEMINI_CHAT_MODEL = "gemini-2.0-flash";
export const GEMINI_EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_DIMENSIONS = 768; // text-embedding-004 default

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("Gemini is not configured. Add GEMINI_API_KEY to .env.local.");
  }
}

let ai: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!ai) {
    const env = serverEnv();
    if (!env.services.gemini) throw new GeminiNotConfiguredError();
    ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return ai;
}

export function geminiEnabled(): boolean {
  return serverEnv().services.gemini;
}

/** One embedding vector for a text chunk. Batching arrives in Phase 9. */
export async function embedText(text: string): Promise<number[]> {
  const res = await client().models.embedContent({
    model: GEMINI_EMBEDDING_MODEL,
    contents: text,
  });
  const values = res.embeddings?.[0]?.values;
  if (!values) throw new Error("Gemini returned no embedding values.");
  return values;
}
