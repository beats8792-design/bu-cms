import { describe, expect, it } from "vitest";
import {
  CHUNK_CHARS,
  CHUNK_OVERLAP,
  chunkText,
  cosineSimilarity,
  dailyQuotaFor,
  withinRateLimit,
  startOfDhakaDay,
  MIN_ASK_GAP_SECONDS,
  AskSchema,
  SummarySchema,
  QuizDraftSchema,
  WeeklyPlanSchema,
  WEEKDAY,
} from "@/modules/ai/schema";
import { extractJson } from "@/modules/ai/openrouter";

describe("chunkText (RAG step 2)", () => {
  it("returns [] for empty/blank text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("short text stays one chunk, normalised", () => {
    expect(chunkText("Line one.\n\n   Line  two.")).toEqual(["Line one. Line two."]);
  });

  it("long text slides with overlap; every char is covered", () => {
    const text = "x".repeat(CHUNK_CHARS * 3 + 100);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    const step = CHUNK_CHARS - CHUNK_OVERLAP;
    // Consecutive chunks overlap by CHUNK_OVERLAP chars.
    expect(chunks[1].startsWith(chunks[0].slice(step))).toBe(true);
    expect(chunks.every((c) => c.length <= CHUNK_CHARS)).toBe(true);
  });
});

describe("cosineSimilarity (retrieval)", () => {
  it("identical vectors = 1, orthogonal = 0", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("mismatched lengths, empty or zero vectors → 0 (no NaN)", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("quotas + rate limit", () => {
  it("per-role daily quotas", () => {
    expect(dailyQuotaFor("student")).toBe(20);
    expect(dailyQuotaFor("cr")).toBe(30);
    expect(dailyQuotaFor("teacher")).toBe(60);
    expect(dailyQuotaFor("admin")).toBe(999);
  });

  it("minimum gap enforced from the last ask", () => {
    const now = new Date("2026-11-12T10:00:00Z");
    expect(withinRateLimit(null, now)).toBe(true);
    expect(withinRateLimit(new Date(now.getTime() - 3000).toISOString(), now)).toBe(false);
    expect(withinRateLimit(new Date(now.getTime() - (MIN_ASK_GAP_SECONDS * 1000 + 1)).toISOString(), now)).toBe(true);
  });

  it("startOfDhakaDay lands on a midnight boundary", () => {
    const s = startOfDhakaDay(new Date("2026-11-12T10:30:00Z"));
    expect(s.toISOString()).toBe("2026-11-11T18:00:00.000Z"); // 00:00 +06
  });
});

describe("extractJson (structured outputs)", () => {
  it("parses clean JSON, fenced JSON and JSON inside prose", () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
    expect(extractJson("```json\n{\"a\": [1,2]}\n```")).toEqual({ a: [1, 2] });
    expect(extractJson('Sure! Here it is: {"q": [{"question": "x?", "options": ["a","b","c","d"], "answerIndex": 2}]} thanks')).toEqual({
      q: [{ question: "x?", options: ["a", "b", "c", "d"], answerIndex: 2 }],
    });
  });

  it("ignores braces inside strings and returns null for garbage", () => {
    expect(extractJson('{"s": "a } b"}')).toEqual({ s: "a } b" });
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson('{"broken": ')).toBeNull();
  });
});

describe("AskSchema", () => {
  it("rejects short questions", () => {
    expect(AskSchema.safeParse({ question: "explain recursion in compilers" }).success).toBe(true);
    expect(AskSchema.safeParse({ question: "hi" }).success).toBe(false);
  });
});

describe("SummarySchema (UCM-A2)", () => {
  const valid = {
    overview: "This lecture covers binary trees.",
    keyPoints: ["Traversals: in/pre/post-order"],
    definitions: [{ term: "BST", meaning: "Binary search tree with ordered nodes" }],
    formulas: [],
    studyQuestions: ["Explain in-order traversal with an example?"],
  };

  it("accepts a well-formed summary", () => {
    expect(SummarySchema.safeParse(valid).success).toBe(true);
  });

  it("requires at least one key point and one study question", () => {
    expect(SummarySchema.safeParse({ ...valid, keyPoints: [] }).success).toBe(false);
    expect(SummarySchema.safeParse({ ...valid, studyQuestions: [] }).success).toBe(false);
  });
});

describe("QuizDraftSchema (UCM-A3)", () => {
  const q = {
    question: "What does BFS stand for?",
    options: ["Breadth-first search", "Best-first search", "Breadth second search", "None"],
    answerIndex: 0,
    explanation: "Standard terminology.",
  };

  it("accepts a 5-question draft; rejects bad answerIndex / option count", () => {
    expect(QuizDraftSchema.safeParse({ questions: Array(5).fill(q) }).success).toBe(true);
    expect(QuizDraftSchema.safeParse({ questions: [{ ...q, answerIndex: 4 }] }).success).toBe(false);
    expect(QuizDraftSchema.safeParse({ questions: [{ ...q, options: q.options.slice(0, 3) }] }).success).toBe(false);
    expect(QuizDraftSchema.safeParse({ questions: [q, q, q, q] }).success).toBe(false); // min 5
  });
});

describe("WeeklyPlanSchema (UCM-A4)", () => {
  const item = { weekday: 1, title: "Revise sorting", focus: "Merge + quick sort", minutes: 60, courseCode: "CSE-101" };

  it("accepts a plan; enforces weekday range and minute bounds", () => {
    expect(WeeklyPlanSchema.safeParse({ summary: "Focus on DSA", items: [item] }).success).toBe(true);
    expect(WeeklyPlanSchema.safeParse({ items: [{ ...item, weekday: 7 }] }).success).toBe(false);
    expect(WeeklyPlanSchema.safeParse({ items: [{ ...item, minutes: 5 }] }).success).toBe(false);
    expect(WeeklyPlanSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it("WEEKDAY covers the BD week (Sun–Thu classes)", () => {
    expect(WEEKDAY(0)).toBe("Sun");
    expect(WEEKDAY(4)).toBe("Thu");
    expect(WEEKDAY(6)).toBe("Sat");
  });
});
