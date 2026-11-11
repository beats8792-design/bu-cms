import { describe, expect, it } from "vitest";
import { parseImportCsv } from "@/modules/admin/csv";
import { nextStatus, type UserTransition } from "@/modules/admin/users";

describe("parseImportCsv", () => {
  it("parses a clean file", () => {
    const csv = "name,email,role,studentId\nAnisur Rahman,anis@x.edu,student,2021-ESD-001\nFarhana Akter,farhana@x.edu,teacher,,";
    const r = parseImportCsv(csv);
    expect(r.rows).toEqual([
      { index: 1, name: "Anisur Rahman", email: "anis@x.edu", role: "student", studentId: "2021-ESD-001" },
      { index: 2, name: "Farhana Akter", email: "farhana@x.edu", role: "teacher", studentId: "" },
    ]);
    expect(r.skipped).toHaveLength(0);
  });

  it("is lenient with quote-wrapped fields and empty roles", () => {
    const r = parseImportCsv('Name,Email,Role\n"Rahman, Jr","jr@x.edu",""');
    expect(r.rows[0]).toMatchObject({ name: "Rahman, Jr", email: "jr@x.edu", role: "student" });
  });

  it("skips invalid rows with reasons and degrades unknown roles", () => {
    const csv = "name,email,role\nNoEmail Person,person-at-x,student\n,x@y.edu,student\nSami,sami@x.edu,registrar";
    const r = parseImportCsv(csv);
    expect(r.rows.map((row) => row.email)).toEqual(["sami@x.edu"]);
    expect(r.rows[0].role).toBe("student");
    expect(r.rows[0].studentId).toBe("");
    // Invalid rows are skipped; the unknown role is *not* skipped but noted.
    expect(r.skipped.filter((s) => !s.reason.startsWith("Unknown role")).map((s) => s.reason)).toEqual([
      "No valid email",
      "No name",
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.skipped.some((s) => s.reason.includes("registrar"))).toBe(true);
  });

  it("deduplicates emails within the file", () => {
    const csv = "name,email\nA,a@x.edu\nB,a@x.edu\n";
    const r = parseImportCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.duplicatesInFile).toBe(1);
  });

  it("rejects missing header columns", () => {
    const r = parseImportCsv("only,name\nX,Y");
    expect(r.rows).toHaveLength(0);
    expect(r.skipped[0]?.reason).toContain("Header must include");
  });

  it("handles empty content", () => {
    const r = parseImportCsv("   ");
    expect(r.rows).toHaveLength(0);
    expect(r.skipped[0]?.reason).toBe("File is empty");
  });
});

describe("nextStatus (UCM-F1 state machine)", () => {
  it("approve only from pending", () => {
    expect(nextStatus("pending", "approve")).toBe("active");
    expect(nextStatus("active", "approve")).toBeNull();
    expect(nextStatus("suspended", "approve")).toBeNull();
  });

  it("suspend from pending/active, not twice", () => {
    expect(nextStatus("pending", "suspend")).toBe("suspended");
    expect(nextStatus("active", "suspend")).toBe("suspended");
    expect(nextStatus("suspended", "suspend")).toBeNull();
  });

  it("reactivate only suspended", () => {
    expect(nextStatus("suspended", "reactivate")).toBe("active");
    expect(nextStatus("active", "reactivate")).toBeNull();
    expect(nextStatus("pending", "reactivate")).toBeNull();
  });

  it("covers every transition value with a typed guard", () => {
    const all: UserTransition[] = ["approve", "suspend", "reactivate"];
    for (const t of all) {
      expect(nextStatus("unknown-state", t)).toBeNull();
    }
  });
});
