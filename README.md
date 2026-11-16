# BU-CMS

University Course Management System for Bangladeshi universities — courses, enrollment,
materials, assignments, marks & results, attendance, announcements, collaboration
(notes / study groups / library), AI study tools, and an admin console with analytics
and audit logs.

Built with **Next.js 16** (App Router, Cache Components), **MongoDB Atlas**,
**BetterAuth** (credential auth + mongo adapter), **Tailwind 4**, **Cloudinary**
(file storage), **Resend** (email) and **Google Gemini** (AI — defaults to
`gemini-3.8-flash`, key `GEMINI_API_KEY`).

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # fill in real values (see table below)
npm run db:setup             # create collections + indexes on your Atlas cluster
npm run adm -- <email>       # promote an existing user to admin (or create one)
npm run dev                  # http://localhost:3000
```

Optional demo dataset (idempotent — safe to re-run):

```bash
npm run seed                 # department, semester, 3 courses, students, marks, attendance…
```

Demo accounts all use the password `Jazbah#2026`:
`teacher@demo.versity.edu`, `cr@demo.versity.edu`, `amin@demo.versity.edu`
(+ 5 more students). The marker `meta.seed-demo` in the `meta` collection tracks it.

## Environment variables

All server-side. Required services fail fast at boot; optional ones degrade to
"disabled" (features hide themselves in the UI).

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | ✅ | Atlas connection string (`mongodb+srv://…`) |
| `MONGODB_DB` | ✅ | Database name, defaults to `ucms` |
| `BETTERAUTH_SECRET` | ✅ | 32+ random chars — `npx auth secret` or `openssl rand -base64 32` |
| `BETTERAUTH_URL` | prod ✅ | e.g. `http://localhost:3000` locally, your domain in prod |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | — | File uploads (materials, notes, submissions) |
| `RESEND_API_KEY` / `RESEND_FROM` | — | Email: verification, password reset, notifications |
| `GEMINI_API_KEY` | — | AI assistant / summaries / quiz / planner |
| `GEMINI_MODEL` | — | Default `gemini-3.8-flash` |
| `GEMINI_EMBEDDING_MODEL` | — | Default `gemini-embedding-001` |
| `CRON_SECRET` | — | Bearer token for `/api/cron/reminders` (Vercel Cron) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run typecheck` / `lint` | `tsc --noEmit` / ESLint |
| `npm run test` | Vitest unit tests |
| `npm run e2e` | Playwright E2E (spins up `next dev` itself) — first run also needs `npx playwright install chromium` |
| `npm run db:setup` | Ensure collections + indexes (run after every deploy that adds indexes) |
| `npm run adm -- <email>` | Create/promote an admin user (sets a temp password) |
| `npm run seed` | Seed the demo dataset (idempotent) |

## Deploying to Vercel + Atlas

1. **Push** this repo to GitHub; import it in Vercel (framework auto-detected, build `next build`).
2. **Environment variables** — set every variable from the table above in Vercel
   (Production + Preview). Generate a fresh `BETTERAUTH_SECRET` for production and
   set `BETTERAUTH_URL` to the deployment URL.
3. **Atlas** — allow connections from Vercel (Atlas "Network Access" → allow all or
   Vercel's IPs; serverless functions have no fixed IP unless you use Atlas's Vercel
   integration). Use the same `MONGODB_DB` name.
4. **First deploy checklist**:
   ```bash
   npm run db:setup          # locally against the prod cluster, or via a one-off job
   npm run adm -- owner@yourdomain.edu
   ```
5. **Cron** — add a Vercel Cron job hitting `/api/cron/reminders` with header
   `Authorization: Bearer <CRON_SECRET>` (assignment deadline reminders).
6. **Verify** — `/api/health` returns ok; sign in with the admin account; check
   `/admin` → analytics load and the audit log records activity.

> Next.js 16 note: route segment config uses `cacheComponents`; auth-gated pages
> export `instant = false` so they render per-request with the session cookie.

## Backups

Daily workflow and the quarterly backup/restore drill (mongodump / mongorestore +
Atlas continuous snapshots) are documented in [`docs/admin-playbook.md`](docs/admin-playbook.md).

## Project layout

```
src/
  app/            routes: (app) shell (dashboard, courses, admin, …), (auth), api/
  components/     shared UI (app-shell, design tokens)
  modules/        feature services + components
    academic/     departments, semesters, courses, enrollment, calendar
    materials/ assignments/ marks/ attendance/ announcements/
    collab/       notes, study groups, library
    ai/           assistant, summaries, quiz, planner (Google Gemini)
    auth/         BetterAuth setup, session helpers, RBAC
    admin/        users, analytics, activity log
  lib/            db client, env validation, shared clients
scripts/          db-setup, create-admin, seed-demo
tests/            vitest unit tests + playwright E2E specs
```
