# CLAUDE.md — Scholarship Agent (Agent 42)

Project context for any AI assistant working on this repo. Read this first.

## What this is
Agent 42, the Scholarship Agent, from a 72-agent academic platform (Vignan University, CSE). All
agents share one PostgreSQL database (the platform schema in `schema/schema_full.sql`). Our app is a
**standalone website that runs on that shared schema**, so it works alone today and plugs into the
full platform later by changing one connection string.

## Design priority
The UI should look genuinely premium and polished, and the "agent" behaviour (reasoning shown,
audit trail, risk flags, human approval) is where the technical depth lives. Visual quality matters,
but never at the cost of the working system underneath.

## Stack
- **PostgreSQL** — Cloud SQL in production, a local Postgres for development. Schema self-creates
  `pgcrypto` + `pg_trgm`; uses `real[]` not pgvector, so it loads on stock Postgres 14+.
- **Flask** (`app.py`) serves the dashboard and a small JSON API.
- **`scholarship_engine.py`** — deterministic reasoning; every number comes from SQL/Python, never
  the LLM.
- **Gemini** via Vertex AI (`gemini-2.5-flash`, using gcloud/ADC — no API key) phrases chat answers
  over the full data context. There is a deterministic offline fallback, so the app works with no
  LLM at all.
- Frontend: plain HTML/CSS/JS in `templates/` + `static/` (no build step). Light-blue sky, white
  cards, blue + gold accents; a friendly "Buji" mascot.

## Architecture (top to bottom)
Browser (dashboard + chat) → Flask `app.py` → `scholarship_engine.py` → `db.py` → Postgres.
Each API route calls exactly one engine function. Read through the **views**
(`people.v_student_profile`, `attendance.v_current_attendance`), not base tables.

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

## Frontend direction (premium + animated)
The front door should look genuinely premium, not a plain dashboard.
- Reference (not strict rules): the `taste-skill` install, current Vercel-site aesthetics, GSAP,
  and Lenis smooth scroll.
- Architecture: an animated **landing + sign-in** that leads into the **functional dashboard**
  (kept clean). Two surfaces, one visual language.
- Stack stays Flask + vanilla JS. **GSAP + Lenis vendored locally** in `static/vendor/` for offline
  reliability.
- **Auth:** a sign-in screen with Google, email, phone, ID and guest options — currently a
  mock/session sign-in; the dashboard is reachable without login for the live demo. Real OAuth is
  optional.
- **Vignan footer:** branded footer (Vignan University, CSE, Agentic AI Day 2026, accreditation
  badges, team names, GitHub link).

## Design guardrails
- Signature: the **coverage-gap meter** (eligible vs covered) + a graduation-cap agent mascot.
- Palette: indigo `#12224e`, blue `#2f6df6`, gold `#e8930c`; success/amber/danger for status.
  One accent locked across the page; tint shadows to the background hue.
- Type: Space Grotesk / Sora (display), Inter (body), IBM Plex Mono (numbers), with a real fallback
  stack.
- Motion must be motivated (hierarchy, reveal, feedback) — not decoration. Honour
  `prefers-reduced-motion`. Keep it responsive and keyboard-focusable. Dark mode via `data-theme`.
- Real logos/badges live in `static/img/` (`vignan-logo.png`, `badges.png`).

## Git history
Commit granularly and often (many small, real commits), attributing both teammates. Do not fabricate
empty/meaningless commits.

## Honesty notes
- Agents 10/11 are stubbed upstream inputs owned by other teams.
- `people.person.social_category` is used ONLY as a lawful statutory scholarship rule, never as an
  ML feature (the schema forbids that).

## Running it
Copy `.env.example` to `.env`, set `DATABASE_URL` (the app reads it via dotenv), `AGENT_USER_ID`,
and — for Gemini — `GEMINI_USE_VERTEX=1` + `GOOGLE_CLOUD_PROJECT` (or a `GEMINI_API_KEY`). Then
`python app.py` and open `http://localhost:5000`. Load `schema/schema_full.sql` then `seed.sql` into
the database first. `.env` is git-ignored and excluded from the Cloud Run build.

## Repo
https://github.com/mounishsai-ai/scholarship-agent-42 . Team: Mounish Sai, Ch. V. K. Ranjith Kumar.
