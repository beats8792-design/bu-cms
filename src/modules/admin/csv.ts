import { z } from "zod";

/**
 * Pure CSV logic for bulk student/teacher import (UCM-D2).
 * Header row required. Recognized columns (case-insensitive):
 *   name* / fullName, email*, studentId, role (student|teacher), section?
 * Missing optional fields are fine; missing name/email skips the row.
 */

const ImportRoleSchema = z.enum(["student", "teacher"]);
export type ImportRow = {
  index: number;
  name: string;
  email: string;
  role: z.infer<typeof ImportRoleSchema>;
  studentId: string;
};

export type ParseResult = {
  rows: ImportRow[];
  skipped: { index: number; reason: string }[];
  duplicatesInFile: number;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export function parseImportCsv(csv: string): ParseResult {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], skipped: [{ index: 0, reason: "File is empty" }], duplicatesInFile: 0 };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (...names: string[]) =>
    header.findIndex((h) => names.includes(h.replaceAll(" ", "")));
  const nameCol = col("name", "fullname");
  const emailCol = col("email", "emailaddress");
  const roleCol = col("role");
  const studentIdCol = col("studentid", "student_id", "id");

  if (emailCol === -1 || nameCol === -1) {
    return {
      rows: [],
      skipped: [{ index: 0, reason: "Header must include at least `name` and `email` columns" }],
      duplicatesInFile: 0,
    };
  }

  const rows: ImportRow[] = [];
  const skipped: { index: number; reason: string }[] = [];
  const seenEmails = new Set<string>();
  let duplicatesInFile = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const name = (cells[nameCol] ?? "").replace(/^"|"$/g, "").trim();
    const email = (cells[emailCol] ?? "").replace(/^"|"$/g, "").trim().toLowerCase();
    const rawRole = (cells[roleCol] ?? "student").replace(/^"|"$/g, "").trim().toLowerCase();
    const studentId = (cells[studentIdCol] ?? "").replace(/^"|"$/g, "").trim();

    if (!email.includes("@")) {
      skipped.push({ index: i, reason: "No valid email" });
      continue;
    }
    if (!name) {
      skipped.push({ index: i, reason: "No name" });
      continue;
    }

    const parsedRole = ImportRoleSchema.safeParse(rawRole === "" ? "student" : rawRole);
    const role = parsedRole.success ? parsedRole.data : "student";
    if (parsedRole.success === false && rawRole !== "") {
      // unknown role strings degrade to student — but flag for transparency
      skipped.push({ index: i, reason: `Unknown role "${rawRole}" imported as student` });
    }

    if (seenEmails.has(email)) {
      duplicatesInFile++;
      continue;
    }
    seenEmails.add(email);

    rows.push({ index: i, name, email, role, studentId });
  }

  return { rows, skipped, duplicatesInFile };
}
