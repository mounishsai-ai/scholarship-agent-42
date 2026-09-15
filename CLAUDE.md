# CLAUDE.md — Agent 42, Scholarship Agent

Lean primer (deep detail: `README.md` → **End-to-End**). Vignan CSE, Agentic AI Day 2026.
Live: https://scholarship-agent-42-1031611339150.asia-south1.run.app

## What it is
Agent 42 of a 72-agent platform that all share **one Postgres DB**. Standalone site that finds every
scholarship a student is eligible for, tracks applications, catches lapsing renewals, and reconciles
disbursements against fees. Runs alone today; plugs into the platform by changing the DB URL.

## Working preferences & context (don't lose these)
- **Judges are non-technical faculty/students who self-evaluate from the deployed links.** So
  **frontend visual impact is decisive** — the login/landing/first-screen must look genuinely
  premium, unique, "jaw-dropping". Don't let design-practicality water down the visuals.
- The bar set this project: full-screen drone-video hero, glassmorphism, campus imagery, animated
  3D AURA robot, orbit hub, audit-trail timeline, swipe/assemble nav. Keep that calibre.
- **Always screenshot a page (headless Chrome/puppeteer) to confirm nothing's visually disturbed
  before deploying.** Follow the user's explicit deploy / "don't deploy yet" instruction each turn;
  batch changes when told to.
- **Assets arrive as dropped files** (logos, badges, videos, images, bot SVG) in `Downloads/` or the
  project root — when the user says "use the new one," search for the newly-downloaded file.
- **No bluffing / fake claims** (e.g. "connected to real DB" as plain text). *Prove* it — live server
  clock, real row counts, provider name. Auth's Google account-picker (4 role accounts) is a
  deliberate demo that shows the multi-role model; keep it, don't wire real OAuth.
- **Local DB (`localhost:5432`) is usually down** → a local "connection timeout" is NOT a prod bug;
  prod uses Cloud SQL. Chrome blocks ports 5432/5060 for `http://` — use 8080+ for local headless checks.

## Stack / files
- **Flask** `app.py` (thin routes) → **`scholarship_engine.py`** (deterministic logic) → **`db.py`** → Postgres.
- Reads through **views** (`people.v_student_profile`, `attendance.v_current_attendance`), not base tables.
- Frontend: plain HTML/CSS/JS in `templates/` + `static/`, no build step; GSAP/Lenis vendored.
- **Gemini 3.8-flash via Vertex ADC** (no API key), `GOOGLE_CLOUD_LOCATION=global`; only *phrases* chat,
  never originates a number. Works fully offline via templates.

## Non-negotiable rules
- **Every figure is computed in SQL/Python. The LLM never invents a number.**
- **Agentic contract on every action:** write `agentops.agent_run → agent_run_input (provenance) →
  agent_output (reasoning_summary) → risk_flag`; student-affecting actions wait on a **human approval gate**.
- **Integration = shared DB, not API calls.** *Consumes* 10 (academic) + 11 (attendance) = we **read**
  their shared tables (stubbed, owned by other teams). *Feeds* 40 (fees) + 41 (reminders) + 43 (loans) =
  we **write** rows they read.
- `people.person.social_category` is used ONLY as a lawful statutory scholarship rule, never as an ML feature.

## Frontend essentials
- Palette: indigo `#12224e`, blue `#2f6df6`, gold `#e8930c` (gold = coverage gap only).
- **Theme is light by default even on dark browsers** — no `prefers-color-scheme`; dark only via the toggle.
- Mascot = **AURA**, the animated 3D robot `static/img/robot.svg` (do NOT reintroduce the old "Buji").
- Bump the `?v=N` query on any CSS/JS you edit (cache-bust for returning viewers).

## Deploy
`gcloud run deploy scholarship-agent-42 --source . --project=project-8dde1e00-67da-41c1-9d9 --region=asia-south1 --quiet`
`.env` is git-ignored + `.gcloudignore`-excluded, so prod Cloud SQL + Vertex env survive the build.
Prefer a quick local look first; ask before deploying if unsure.

## Git
Commit granularly, alternating the two teammates (Mounish Sai `mounishsai.ai@gmail.com`,
Ch. V. K. Ranjith Kumar `vu.241fa04806@gmail.com`), each ending with the Claude co-author trailer.
Repo: https://github.com/mounishsai-ai/scholarship-agent-42
