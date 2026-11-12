import { describe, expect, it } from "vitest";
import { attPct, fillPct, riskFlags, isAtRisk, type RiskFlags } from "@/modules/admin/analytics";
import { csvCell, activitiesCsv } from "@/modules/admin/activity";
import { LOG_ACTIONS } from "@/modules/admin/activity";

describe("attPct / fillPct (pure analytics helpers)", () => {
  it("attendance pct rounds to 0.1 and returns null when nothing applicable", () => {
    expect(attPct(17, 20)).toBe(85);
    expect(attPct(1, 3)).toBe(33.3);
    expect(attPct(0, 0)).toBeNull();
    expect(attPct(0, 5)).toBe(0);
  });

  it("seat fill pct guards zero seats", () => {
    expect(fillPct(30, 40)).toBe(75);
    expect(fillPct(5, 0)).toBe(0);
  });
});

describe("riskFlags (UCM-D5)", () => {
  it("flags low attendance below the course threshold", () => {
    expect(riskFlags(60, 75, 88).lowAttendance).toBe(true);
    expect(riskFlags(75, 75, 88).lowAttendance).toBe(false);
  });

  it("no attendance data is not 'low attendance'", () => {
    expect(riskFlags(null, 75, 88).lowAttendance).toBe(false);
  });

  it("failing requires marks data (missing marks ≠ F)", () => {
    expect(riskFlags(90, 75, 35).failing).toBe(true);
    expect(riskFlags(90, 75, null).failing).toBe(false);
    expect(riskFlags(90, 75, null).noMarksData).toBe(true);
  });

  it("at-risk = either flag", () => {
    const onlyAtt: RiskFlags = riskFlags(60, 75, 90);
    const onlyFail: RiskFlags = riskFlags(90, 75, 10);
    const healthy: RiskFlags = riskFlags(90, 75, 90);
    expect(isAtRisk(onlyAtt)).toBe(true);
    expect(isAtRisk(onlyFail)).toBe(true);
    expect(isAtRisk(healthy)).toBe(false);
  });
});

describe("CSV building (UCM-D7)", () => {
  it("escapes quotes, commas and newline cells", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell("plain")).toBe('"plain"');
  });

  it("guards formula injection (=, +, -, @ leading cells)", () => {
    expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvCell("@cmd")).toBe('"\'@cmd"');
  });

  it("activitiesCsv emits a header + row per entry with CRLF", () => {
    const csv = activitiesCsv([
      {
        id: "1",
        actorId: "u1",
        actorName: "Admin",
        actorEmail: "a@x.edu",
        action: "user.approve",
        target: "s@x.edu",
        detail: "",
        createdAt: "2026-11-12T10:00:00.000Z",
      },
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("actor");
    expect(lines[1]).toContain("user.approve");
    expect(lines[1]).toContain("Admin");
  });
});

describe("LOG_ACTIONS catalogue", () => {
  it("covers the instrumented mutations with dotted names", () => {
    expect(LOG_ACTIONS).toContain("user.approve");
    expect(LOG_ACTIONS).toContain("enrollment.override");
    expect(LOG_ACTIONS).toContain("marks.publish");
    expect(LOG_ACTIONS.every((a) => /^[a-z]+\.[a-z]+$/.test(a))).toBe(true);
  });
});
