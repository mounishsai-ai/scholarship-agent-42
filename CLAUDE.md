# CLAUDE.md — Scholarship Agent (Agent 42)

Project context for any AI assistant working on this repo. Read this first.

## What this is
Our entry for **Agentic AI Day 2026** (Vignan University, CSE). The event splits a 72-agent
academic platform across ~72 teams; **our team owns Agent 42, the Scholarship Agent.** All agents
share one PostgreSQL database (the platform schema in `schema/schema_full.sql`). Our app is a
**standalone website that runs on that shared schema**, so it demos alone today and plugs into the
full platform later by changing one connection string.

Deadline: **2026-09-12, 2:00 PM.** Team of two.

## Who judges it (design implications — important)
Judges are **regular faculty, not developers.** First screening is largely on the **frontend**:
it must look **stunning and polished**, because that is what earns the first-round pass. So visual
quality is a first-class requirement, not a nice-to-have — but never at the cost of the working
system underneath. It is also an *agentic AI* event, so the "agent" behaviour (reasoning shown,
audit trail, risk flags, human approval) is where the technical points are.

## Stack
- **Postgres** on Supabase (free tier). Schema self-creates `pgcrypto` + `pg_trgm`; uses `real[]`
  not pgvector, so it loads on stock Postgres 14+.
- **Flask** (`app.py`) serves the dashboard and a small JSON API.
- **`scholarship_engine.py`** — deterministic reasoning; every number comes from SQL/Python, never
  the LLM.
- **Gemini** (Google AI Studio key or Vertex via gcloud) is OPTIONAL, used only to phrase chat
  answers. The app runs fully offline without it.
- Frontend: plain HTML/CSS/JS in `templates/` + `static/` (no build step). Design language echoes
  the event's "Buji" bot: light-blue sky, white cards, blue + gold accents.

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

## Frontend direction (v2 — premium + animated)
Faculty judges screen on visual impact, so the front door must look genuinely premium, not a plain
dashboard.
- **Do NOT use the `frontend-design` skill** — it pushes a minimal look the team finds too plain.
- **Reference (not strict rules):** the `taste-skill` install (`~/.claude/skills/taste-skill`,
  especially `skills/taste-skill/SKILL.md` and `soft-skill`), latest Vercel-site aesthetics,
  emilkowalski animation patterns, GSAP, and Lenis smooth scroll.
- **Architecture:** a stunning animated **landing page + "Sign in with Google" screen** (taste-skill
  territory) that leads into the **functional dashboard** (kept clean; taste-skill explicitly is not
  for dashboards/data-tables). Two surfaces, one visual language.
- **Stack stays Flask + vanilla JS** (no React/Tailwind build — one day left, working app in hand).
  Use **GSAP + Lenis vendored locally** in `static/vendor/` for offline reliability. Take taste-skill
  React snippets as inspiration, port to vanilla.
- **Auth:** add a "Sign in with Google" screen. Real Google OAuth if time allows; otherwise a clean
  mock session (a button that sets a session and enters the dashboard) — visual is what matters for
  screening. Also offer email/guest entry. Keep the dashboard reachable for the live demo.
- **Vignan footer:** branded footer on the landing (Vignan University, CSE, Agentic AI Day 2026,
  accreditation badges, team names, GitHub link).

## Design guardrails
- Signature: the **coverage-gap meter** (eligible vs covered) + a graduation-cap agent mascot.
- Palette: indigo `#12224e`, blue `#2f6df6`, gold `#e8930c`; success/amber/danger for status.
  One accent locked across the page; tint shadows to the background hue.
- Type: Space Grotesk / Sora (display), Inter (body), IBM Plex Mono (numbers). Self-host or
  `font-display: swap` with a real fallback stack.
- Motion must be motivated (hierarchy, reveal, feedback) — not decoration. Honour
  `prefers-reduced-motion`. Keep it responsive and keyboard-focusable.
- Real logos/badges (Vignan, NAAC/NIRF/NBA/UGC/ABET) drop into `static/img/` — see its README.

## Git history
Commit granularly and often (many small, real commits) so the contribution graph is active and
shows both teammates. We do not fabricate empty/meaningless commits to hit a number.

## Honesty notes to keep in the pitch
- Agents 10/11 are stubbed upstream inputs owned by other teams.
- `people.person.social_category` is used ONLY as a lawful statutory scholarship rule, never as an
  ML feature (the schema forbids that).

## Running it
Local (already verified against Postgres 16 in Docker):
`DATABASE_URL=postgresql://postgres:pg@localhost:55432/platform` with the throwaway `pg42`
container. For the real thing use Supabase — see `README.md`. Load `schema/schema_full.sql` then
`seed.sql`, set `.env`, `python app.py`, open `http://localhost:5000`.

## Repo
Private: https://github.com/mounishsai-ai/scholarship-agent-42 . Commits co-author Ranjith Kumar
and Claude. Team: Mounish Sai, Ch. V. K. Ranjith Kumar.
