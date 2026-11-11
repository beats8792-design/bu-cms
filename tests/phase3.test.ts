import { describe, expect, it } from "vitest";
import {
  canUpload,
  formatBytes,
  groupByTopic,
  isFileType,
  normalizeTopic,
} from "@/modules/materials/schema";

describe("canUpload", () => {
  const MB = 1024 * 1024;

  it("accepts whitelisted types within 30 MB", () => {
    expect(canUpload({ fileType: "pdf", size: 12 * MB, fileName: "slides.pdf" })).toEqual({ ok: true, fileType: "pdf" });
    expect(canUpload({ fileType: "docx", size: 5 * MB, fileName: "notes.docx" })).toEqual({ ok: true, fileType: "docx" });
    expect(canUpload({ fileType: "pptx", size: 20 * MB, fileName: "deck.pptx" })).toEqual({ ok: true, fileType: "pptx" });
    expect(canUpload({ fileType: "zip", size: 30 * MB, fileName: "lab.zip" })).toEqual({ ok: true, fileType: "zip" });
  });

  it("rejects unknown extensions with the allowed list", () => {
    const r = canUpload({ fileType: "exe", size: 1 * MB, fileName: "virus.exe" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Allowed:");
  });

  it("rejects oversize files with the 30 MB message", () => {
    const r = canUpload({ fileType: "pdf", size: 31 * MB, fileName: "big.pdf" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("File too large (max 30 MB).");
  });

  it("rejects empty files", () => {
    const r = canUpload({ fileType: "pdf", size: 0, fileName: "empty.pdf" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("empty");
  });

  it("derives the type from the file name, not the claimed label", () => {
    // file name wins: claimed pdf but really a zip
    expect(canUpload({ fileType: "pdf", size: MB, fileName: "thing.zip" })).toEqual({ ok: true, fileType: "zip" });
  });
});

describe("normalizeTopic", () => {
  it("defaults to General", () => {
    expect(normalizeTopic(undefined)).toBe("General");
    expect(normalizeTopic("   ")).toBe("General");
  });

  it("trims and caps at 80 chars", () => {
    expect(normalizeTopic("  Week 1 ")).toBe("Week 1");
    expect(normalizeTopic("x".repeat(100)).length).toBe(80);
  });
});

describe("groupByTopic", () => {
  const m = (topic: string, title: string) => ({ topic, title });

  it("groups, sorts topics alphabetically and titles inside each", () => {
    const grouped = groupByTopic([
      m("Week 2", "b deck"),
      m("General", "readme"),
      m("Week 1", "z slides"),
      m("Week 1", "a handout"),
    ]);
    expect([...grouped.keys()]).toEqual(["General", "Week 1", "Week 2"]);
    expect(grouped.get("Week 1")!.map((x) => x.title)).toEqual(["a handout", "z slides"]);
  });

  it("keeps empty input empty", () => {
    expect(groupByTopic([]).size).toBe(0);
  });
});

describe("misc", () => {
  it("isFileType and formatBytes", () => {
    expect(isFileType("pdf")).toBe(true);
    expect(isFileType("exe")).toBe(false);
    expect(isFileType(null)).toBe(false);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
