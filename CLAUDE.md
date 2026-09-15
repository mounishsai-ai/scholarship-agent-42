# CLAUDE.md — Scholarship Agent (Agent 42)

Project context for any AI assistant working on this repo. Read this first.

## What this is
Agent 42, the Scholarship Agent, from a 72-agent academic platform (Vignan University, CSE). All
agents share one PostgreSQL database (the platform schema in `schema/schema_full.sql`). Our app is a
**standalone website that runs on that shared schema**, so it works alone today and plugs into the
full platform later by changing one connection string.

**Live:** https://scholarship-agent-42-1031611339150.asia-south1.run.app (Google Cloud Run).

## Design priority
The UI should look genuinely premium and polished — cinematic, not a plain dashboard — and the
"agent" behaviour (reasoning shown, audit trail, risk flags, human approval) is where the technical
depth lives. Visual quality matters, but never at the cost of the working system underneath.

## Stack
- **PostgreSQL** — Cloud SQL in production (unix socket `/cloudsql/…`), a local Postgres for dev.
  Schema self-creates `pgcrypto` + `pg_trgm`; uses `real[]` not pgvector, so it loads on stock PG 14+.
- **Flask** (`app.py`) serves both pages and a small JSON API. Each API route calls exactly one
  engine function. Read through the **views** (`people.v_student_profile`,
  `attendance.v_current_attendance`), not base tables.
- **`scholarship_engine.py`** — deterministic reasoning; every number comes from SQL/Python, never
  the LLM.
- **Gemini** via Vertex AI ("Gemini Enterprise"), model **`gemini-3.8-flash`**, location
  **`global`** (us-central1 404s the 3.x models), using gcloud/ADC — **no API key**. Env:
  `GEMINI_USE_VERTEX=1`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`. It only *phrases*
  chat answers over the data context; there is a deterministic offline fallback so the app works
  with no LLM at all.
- **Frontend:** plain HTML/CSS/JS in `templates/` + `static/` (no build step). **GSAP + Lenis are
  vendored** in `static/vendor/` for offline reliability. Bump the `?v=N` query on any CSS/JS you
  change so returning viewers don't get a stale cache.

## Two surfaces, one visual language
- **Landing (`/`, `templates/landing.html` + `static/css/landing.css` + `landing.js`)** — a premium
  scroll page: campus-photo hero (deep-blue overlay over `img/campus.webp`, slow Ken-Burns), the
  live **coverage-gap meter** card with the **AURA** robot, then story sections (coverage → three
  student failures → platform integration → how-it-works → CTA → Vignan footer).
- **Dashboard (`/dashboard`, `templates/index.html` + `static/css/style.css` + `app.js`)** — the
  working data app. A full-screen **drone-video hero**, then the tabbed data panels.
- The two headers are matched in height so the bar doesn't jump when you sign in.

## Signature dashboard hero (the money shot)
- **Full-screen looping campus drone video** (`static/video/campus.mp4`, ~1.5 MB H.264, muted).
  It plays, **fades to pure black over 3s, holds black 2s, then loops** (baked into the file).
  `img/campus-hero.jpg` is the poster/fallback; JS fades the video in only once it actually plays.
- A **full-width liquid-glass status bar** floats over the video: "● Google Cloud SQL connected ·
  Consumes Agent 10, 11 · Feeds Agent 40, 41, 43 · See live data & lineage →" (that link switches to
  Integrations **and scrolls to it**).
- **Animated gradient headline** counts up the live coverage gap ("25 scholarship matches are sitting
  unclaimed"), in the current role's voice.
- **3D-tilt glassmorphic KPI cards** (eligible / covered / gap / renewals / suppress) that tilt to
  the cursor.
- A **role switcher** (Scholarship Officer / HoD / Accounts / Student).

## Navigation & motion
- **Sticky tab bar** pinned *below* the header (JS sets `--topbar-h` = header height so they never
  overlap).
- Move between sections by **click, swipe, mouse-drag, arrow keys, or on-screen ‹ › arrows** — none
  required; a one-time hint pill advertises it. Panels **stagger-assemble** (cards glide in from the
  swipe direction and settle). Scroll position is preserved across a tab switch.
- **Integrations tab:** an **orbit hub** (Agent 42 core with Agents 10/11 orbiting as "consumes",
  40/41/43 as "feeds") + a live DB-connection card (live server clock, provider/instance,
  21 schemas / 225 tables, provenance).
- **Agent Activity tab:** the audit trail as an **alternating timeline** (event cards on a central
  spine with gear nodes) + the human-approval queue + open risk flags.
- Honour `prefers-reduced-motion`; keep everything responsive and keyboard-focusable.

## The agentic contract (what makes it not-CRUD)
Every action writes `agentops.agent_run` → `agent_output` (with a `reasoning_summary`), records
provenance in `agent_run_input`, raises `agentops.risk_flag` (`flag_type='SCHOLARSHIP_RISK'`) for
renewals, and routes notifications through a `human_review` approval gate. Keep this trail on every
new action.

## Declared integrations (from the spec)
Agent 42 *Consumes Agents 10, 11. Feeds Agents 40, 41, 43.* We read attendance (11) and academic
performance (10) from shared views and label them stubbed; we feed fee management (40), fee
reminders (41, suppression), and education-loan docs (43). Do not fake-build 10/11.

## Three demo beats (seeded in `seed.sql`, keep intact)
1. **Priya 23CSE001** — eligible for schemes nobody told her about.
2. **Arjun 23CSE002 / Arun 23CSE016** — sanctioned scholarship at renewal risk (attendance < 75%).
3. **Fatima 23CSE003** — chased for fees a disbursed scholarship already covers; the reconcile
   action recommends suppressing the reminder and quotes the schema's own COMMENT.

20 seeded students (`23CSE001`–`23CSE020`); scale by copying the last seed block.

## Auth (intentionally a demo bluff — keep it)
Sign-in is a session flag, no real credentials. **"Sign in with Google" opens a fake Google
account-picker with four role accounts** (Officer / HoD / Accounts / Student); each account **locks
to that one role**, guest previews all. This is deliberate — it *demonstrates the multi-role access
model* to evaluators. Real OAuth would capture one email but lose that demonstration, so we do NOT
use it. The dashboard is reachable without login so the live demo always opens.

## Design guardrails
- **Palette:** indigo `#12224e`, blue `#2f6df6`, gold `#e8930c` (gold reserved for the coverage
  gap); success/amber/danger for status. One accent locked across the page; tint shadows to the bg.
- **Type:** Space Grotesk / Sora (display), Inter (body), IBM Plex Mono (numbers), real fallbacks.
- **Theme:** light by default **even when the browser prefers dark** — there is deliberately no
  `prefers-color-scheme`; dark applies only via the toggle (`:root[data-theme="dark"]`, saved to
  localStorage). Give `body` an explicit background.
- **Mascot: AURA** — an animated 3D robot (`static/img/robot.svg`, a self-animating SMIL SVG, glossy
  white body + blue eyes). Used on the landing hero and as the "Ask AURA" chat launcher. (The old
  flat "Buji" SVG is gone — do not reintroduce that name.)
- **Consent:** a first-run privacy **wall** (centered card over a dimming, blurred backdrop) that
  makes the visitor choose before browsing; on the landing it also **gates the intro animation** so
  first-time visitors actually see it. `static/css/consent.css` + `consent.js`.
- Motion must be motivated (hierarchy, reveal, feedback), never decoration.

## Assets (`static/img/`, `static/video/`)
- `vignan-logo.svg` — the crisp **vector "Deemed University" logo** (used everywhere).
- `badges.png` — transparent accreditation strip (NAAC A+, NIRF, NBA, AICTE, UGC 12(B), DSIR, QS),
  **glow rings baked in**, glow padding trimmed so the badges read large in a short header.
- `campus.webp` — blue-toned drone aerial (landing hero background).
- `campus-hero.jpg` — dashboard video poster/fallback.
- `robot.svg` — the animated AURA robot.
- `video/campus.mp4` — the fade-to-black drone loop.

## Deploy
From `scholarship-agent/`:
`gcloud run deploy scholarship-agent-42 --source . --project=project-8dde1e00-67da-41c1-9d9 --region=asia-south1 --quiet`
`.env` is git-ignored and excluded via `.gcloudignore`, so the production `DATABASE_URL` (Cloud SQL)
and Gemini/Vertex env on the service are never clobbered by the build. Prefer a quick local look
before deploying; bump `?v=` on changed CSS/JS.

## Running locally
Copy `.env.example` to `.env`, set `DATABASE_URL` (read via dotenv), `AGENT_USER_ID`, and — for
Gemini — `GEMINI_USE_VERTEX=1` + `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION=global`. Load
`schema/schema_full.sql` then `seed.sql`. Then `python app.py` → `http://localhost:5000`. (Chrome
blocks a few ports like 5432/5060 for `http://` — use 8080/8082/etc. when driving it headless.)

## Git history
Commit granularly and often (many small, real commits), attributing both teammates. Do not fabricate
empty/meaningless commits.

## Honesty notes
- Agents 10/11 are stubbed upstream inputs owned by other teams.
- `people.person.social_category` is used ONLY as a lawful statutory scholarship rule, never as an
  ML feature (the schema forbids that).
- Every figure the UI shows is computed in SQL/Python; the LLM never originates a number.

## Repo
https://github.com/mounishsai-ai/scholarship-agent-42 . Team: Mounish Sai, Ch. V. K. Ranjith Kumar.
