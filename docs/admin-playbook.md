# Jazbah UCMS — Admin Playbook

Operating guide for the system owner / admin staff. Covers day-to-day
administration (users, courses, analytics, data quality, audit) and the
backup/restore drill.

Sign in with an admin account (created via `npm run adm -- <email>`) and open
the admin console from the sidebar: `/admin`.

---

## 1. People & access — `/admin/users`

### User lifecycle

Status state machine (strict — invalid transitions are rejected):

```
pending ──approve──▶ active ──suspend──▶ suspended
   │                    ▲                    │
   └──────suspend───────┼────reactivate─────┘
```

- **Pending** — self-registered or CSV-imported users. They can log in but see
  a holding page until approved.
- **Approve** — flips to `active`; the user gets full access for their role.
- **Suspend** — blocks login (redirects to `/suspended`), keeps all data.
  Protects the institution's last active admin from being locked out.
- **Reactivate** — back to `active`.

Also per user:

- **Role change** — student ⇄ teacher ⇄ cr ⇄ admin. Grant `admin` sparingly.
- **Mark email verified** — for users whose verification email expired/never
  arrived (email features need `RESEND_API_KEY`).
- **Password resets** — users self-serve via "Forgot password" on `/login`
  (needs Resend). If a user can't receive email, create the account with
  `npm run adm -- <email>` which sets a temp password you can hand over.

### CSV bulk import — `/admin/users/import`

Upload a CSV with a header row. Recognized columns (case-insensitive):

```csv
name,email,studentId,role
Aminul Islam,amin@x.edu,2101001,student
Jahid Hasan,jahid@x.edu,,teacher
```

- `name` and `email` are required per row; `role` is `student|teacher`
  (defaults to student); `studentId` optional.
- Missing fields are reported per row; duplicates inside the file and against
  existing accounts are skipped, never overwritten.
- Imported users are created `pending` with a random temp password (shown in
  the result) — approve them after verifying, and have them reset their
  password on first login.

---

## 2. Academic structure — `/admin/departments`, `/admin/semesters`, `/admin/courses`

1. **Departments** first (code + name).
2. **Semesters** (term + academic year + enrollment window). Only the *open*
   semester accepts self-service enrollment.
3. **Courses** belong to a department + semester; set seat limit, schedule
   slots, and assign teachers. Teachers manage their own courses' materials,
   assignments, marks, and attendance.

---

## 3. Analytics — `/admin/analytics`

- **Institution counts** — users by role/status, departments, semesters, courses.
- **Department health** — students per department vs enrollment fill rates
  (courses fill % per department).
- **Attendance trends** — weekly attended/possible across the institution.
- **Grade distributions** — published results per course (A+…F counts).
- **At-risk students** — students flagged by low attendance %, missing marks,
  or failing totals (PRD UCM-D5). Useful before advising/parent meetings.
- **Assignment stats** — submission counts and on-time rates per assignment.

CSV exports (UCM-D7), for archiving/registrar upload:

```
GET /api/admin/reports/activity-logs   → full audit log CSV
GET /api/admin/reports/at-risk        → at-risk student report CSV
```

---

## 4. Data quality — `/admin/analytics` (bottom panel)

The panel lists four issue kinds and what to do about them:

| Kind | Meaning | Fix |
| --- | --- | --- |
| `schema-missing` | Course has enrollments but no assessment schema — results can't compute. | Ask the teacher to publish the mark schema (ct1/ct2/mid/final…). |
| `marks-missing` | N mark entries missing (components × students). | Teacher completes the marks grid and publishes. |
| `stale-session` | Attendance session open > 24h. | Teacher closes the session from the course attendance page. |
| `extraction-failed` | Material has no text layer — the AI index skips it. | Re-upload as PDF/text/docx, or mark hidden if not needed for AI. |

Run this before each semester's result publication.

---

## 5. Audit log — `/admin/logs`

Every privileged mutation (user transitions, imports, role changes, publishes,
deletes…) is recorded fire-and-forget with actor, action, target and timestamp.
Use it to answer "who did what" and export the full trail via the CSV report
above.

---

## 6. Backup & restore

### Daily habits

- MongoDB **Atlas handles backups** — on M10+ enable *Continuous Backup*
  (point-in-time) or at least *Scheduled snapshots* (daily, retained ≥ 7 days).
- Files live in **Cloudinary** — assets are versioned and not part of DB dumps;
  Cloudinary retains originals per its plan settings.
- Keep `.env.local` / Vercel env values in a password manager — losing
  `BETTERAUTH_SECRET` invalidates all sessions and encrypted reset tokens.

### Quarterly restore drill (do this, don't assume it works)

1. **Snapshot the current state** (so the drill is reversible):
   ```bash
   mongodump --uri "$MONGODB_URI" --db ucms --out drill-pre
   ```
2. **Take a fresh Atlas snapshot** (Cluster → Backup → "Snapshots" → *Take
   snapshot now*).
3. **Restore into a scratch database** (never straight over `ucms`):
   - Atlas: *Backup → snapshot → Restore* → choose "Restore to a new
     namespace/cluster" (or download the snapshot archive).
   - Local check of the dump: `mongorestore --uri "$MONGODB_URI" --nsFrom "ucms.*" --nsTo "drill-restore.*" drill-pre/ucms`
4. **Verify the copy** — row counts match, and spot-check:
   ```js
   db.user.countDocuments()          // matches live
   db.enrollments.countDocuments()   // matches live
   db.marks.countDocuments()         // matches live
   ```
   Then point a temp app instance (`MONGODB_DB=drill-restore`) at it and log in
   with a real account — sessions survive only if `session` collection is
   intact; users can always re-login because `user` + `account` rows are there.
5. **Tear down** the scratch database, confirm the live app untouched, and log
   the drill (date, snapshot id, result) in `Brain/LOG.md`.

### Disaster recovery runbook

- **Bad data / accidental deletes** → restore the latest snapshot into a new
  namespace, diff, and copy back only the affected collections/documents.
- **Cluster outage** → Atlas auto-failover; app reconnects (pool is cached per
  process — if connections stay broken, redeploy to recycle).
- **Full loss** → provision new cluster, `npm run db:setup`, restore snapshot,
  redeploy Vercel with the same env vars, verify `/api/health`.
