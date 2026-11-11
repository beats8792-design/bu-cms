import { describe, expect, it } from "vitest";
import {
  validateComponents,
  validateGradeTable,
  weightedTotal,
  gradeFor,
  canWriteMark,
  componentAverages,
  componentAveragePercent,
  DEFAULT_GRADE_TABLE,
  type AssessmentComponent,
  type GradeTableEntry,
} from "@/modules/marks/schema";

const COMPONENTS: AssessmentComponent[] = [
  { key: "ct", name: "Class Test", maxMarks: 20, weight: 20 },
  { key: "mid", name: "Midterm", maxMarks: 30, weight: 30 },
  { key: "assignment", name: "Assignment", maxMarks: 10, weight: 10 },
  { key: "final", name: "Final Exam", maxMarks: 40, weight: 40 },
];

function scores(entries: Array<[string, number | null]>): Map<string, number | null> {
  return new Map(entries);
}

describe("validateComponents (UCM-F18)", () => {
  it("accepts weights summing to exactly 100", () => {
    expect(validateComponents(COMPONENTS)).toEqual({ ok: true });
  });

  it("rejects weights off 100 by any amount", () => {
    const off = [...COMPONENTS];
    off[0] = { ...off[0], weight: 15 }; // now 95
    const r = validateComponents(off);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("exactly 100");
  });

  it("rejects duplicate keys and zero maxMarks", () => {
    const dup = [COMPONENTS[0], { ...COMPONENTS[1], key: "ct" }];
    expect(validateComponents(dup).ok).toBe(false);
    expect(validateComponents([{ ...COMPONENTS[0], maxMarks: 0 }]).ok).toBe(false);
    expect(validateComponents([]).ok).toBe(false);
  });
});

describe("weightedTotal (UCM-F20)", () => {
  it("computes Σ score/max × weight exactly", () => {
    // 18/20*20 + 24/30*30 + 9/10*10 + 32/40*40 = 18+24+9+32 = 83
    expect(weightedTotal(scores([["ct", 18], ["mid", 24], ["assignment", 9], ["final", 32]]), COMPONENTS)).toBe(83);
  });

  it("treats missing marks as 0", () => {
    expect(weightedTotal(scores([["mid", 30]]), COMPONENTS)).toBe(30);
  });

  it("clamps scores above maxMarks", () => {
    expect(weightedTotal(scores([["ct", 999]]), COMPONENTS)).toBe(20);
  });

  it("rounds to 2 decimals", () => {
    // 1/3 of a 30-mark midterm at weight 10 → 3.333…
    expect(weightedTotal(scores([["mid", 10]]), [{ ...COMPONENTS[1], weight: 10 }])).toBeCloseTo(3.33);
  });
});

describe("grade table (UCM-F21)", () => {
  it("default table maps the standard BD scale", () => {
    expect(gradeFor(83).letter).toBe("A+");
    expect(gradeFor(80).letter).toBe("A+");
    expect(gradeFor(79.99).letter).toBe("A");
    expect(gradeFor(75).letter).toBe("A");
    expect(gradeFor(70).letter).toBe("A-");
    expect(gradeFor(65).letter).toBe("B+");
    expect(gradeFor(60).letter).toBe("B");
    expect(gradeFor(55).letter).toBe("B-");
    expect(gradeFor(50).letter).toBe("C+");
    expect(gradeFor(45).letter).toBe("C");
    expect(gradeFor(40).letter).toBe("D");
    expect(gradeFor(39.99).letter).toBe("F");
    expect(gradeFor(0).letter).toBe("F");
  });

  it("carries GPA points", () => {
    expect(gradeFor(85).point).toBe(4.0);
    expect(gradeFor(42).point).toBe(2.0);
    expect(gradeFor(10).point).toBe(0.0);
  });

  it("honors an overridden table", () => {
    const table: GradeTableEntry[] = [
      { min: 90, letter: "S", point: 4.5 },
      { min: 0, letter: "F", point: 0 },
    ];
    expect(gradeFor(91, table).letter).toBe("S");
    expect(gradeFor(89, table).letter).toBe("F");
  });

  it("validates the table shape", () => {
    expect(validateGradeTable(DEFAULT_GRADE_TABLE).ok).toBe(true);
    expect(validateGradeTable([{ min: 10, letter: "A", point: 4 }]).ok).toBe(false);
    expect(
      validateGradeTable([
        { min: 0, letter: "F", point: 0 },
        { min: 80, letter: "A", point: 4 },
      ]).ok,
    ).toBe(false);
  });
});

describe("canWriteMark (UCM-F19/F23)", () => {
  const teacher = { role: "teacher", isTeacherOfCourse: true, published: false, hasReason: false };
  const admin = { role: "admin", isTeacherOfCourse: false, published: false, hasReason: false };

  it("lets the course teacher and admin write before publish", () => {
    expect(canWriteMark(teacher)).toEqual({ ok: true, isOverride: false });
    expect(canWriteMark(admin)).toEqual({ ok: true, isOverride: false });
  });

  it("blocks other teachers and students", () => {
    expect(canWriteMark({ ...teacher, isTeacherOfCourse: false }).ok).toBe(false);
    expect(canWriteMark({ role: "student", isTeacherOfCourse: false, published: false, hasReason: false }).ok).toBe(false);
  });

  it("after publish: teacher blocked, admin needs a reason", () => {
    const published = { ...teacher, published: true };
    const r1 = canWriteMark(published);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toContain("admin");

    const r2 = canWriteMark({ ...admin, published: true, hasReason: false });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toContain("reason");

    expect(canWriteMark({ ...admin, published: true, hasReason: true })).toEqual({
      ok: true,
      isOverride: true,
    });
  });
});

describe("component averages (UCM-F24)", () => {
  it("averages per component and converts to % of max", () => {
    const rows = [
      { scores: scores([["ct", 10], ["mid", 30]]) },
      { scores: scores([["ct", 20], ["mid", null]]) },
    ];
    const avg = componentAverages(rows, COMPONENTS);
    expect(avg.get("ct")).toBe(15);
    expect(avg.get("mid")).toBe(30); // null excluded
    expect(avg.get("final")).toBeNull(); // nobody has marks

    expect(componentAveragePercent(15, COMPONENTS[0])).toBe(75);
    expect(componentAveragePercent(null, COMPONENTS[0])).toBeNull();
  });
});
