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
- **Local DB** connects to the *real* Cloud SQL via the Auth Proxy (see **Local DB** section). If the
  proxy isn't running, `localhost:5432` is down and a "connection timeout" is NOT a prod bug.

## Stack / files
- **Flask** `app.py` (thin routes) → **`scholarship_engine.py`** (deterministic logic) → **`db.py`** → Postgres.
- **`accounts.py`** — real student sign-in: username = register number (e.g. `23CSE001`), first password =
  the register number; bcrypt via pgcrypto in the additive table `identity.agent42_credential` (shared
  `identity.app_user` is never altered). Students change it from the profile menu. Other login modes
  (email/phone/empid/Google picker/guest) are still demo entry points.
- **Cohort = 1000 students**: 22CSE001–250 … 25CSE001–250 (the hand-written 23CSE001–020 demo beats from
  `seed.sql` are kept). Seeded by **`scripts/seed_cohort.py`** (deterministic, re-runnable; run after
  `schema_full.sql` + `seed.sql`). Cohort filter is `roll_no ~ '^[0-9]{2}CSE[0-9]{3}$'` (`COHORT_SQL`).
- **Frontend layers**: `app.js` (base loaders, tabs, roles, chat) then **`upgrade.js` + `upgrade.css`** (loaded
  last) which *override* every panel loader — edit panels in `upgrade.js`, not `app.js`.
- Reads through **views** (`people.v_student_profile`, `attendance.v_current_attendance`), not base tables.
- Frontend: plain HTML/CSS/JS in `templates/` + `static/`, no build step; GSAP/Lenis vendored.
- **Gemini 3.8-flash via Vertex ADC** (no API key), `GOOGLE_CLOUD_LOCATION=global`; only *phrases* chat,
  never originates a number. Works fully offline via templates.

## Scale rules (1000 students — keep it this way)
- No per-row DB round-trips: batch facts (`get_students` once), bulk writes (`executemany`). Renewal risk rows
  are written once per award per day and a flag only if no identical OPEN flag exists.
- Never put `crypt()` in a WHERE over many rows (it bcrypts every account) — find the row first.
- JSON is gzipped in `after_request`; `/api/matrix` cells are slim (state + rule trace, no prose).
- Long lists are searched/filtered/paged (`PAGE = 25`, `PAGERS` in `upgrade.js`), never 1000 animated nodes.
- A register-number session is scoped **server-side** (`_student_scope`, `_staff_only`): own rows only,
  staff endpoints 403 — the frontend must not call staff endpoints for a locked student.
- Local test DB: `docker run -d --name a42pg -e POSTGRES_PASSWORD=local -e POSTGRES_DB=platform -p 55432:5432 postgres:16`,
  load `schema/schema_full.sql`, `seed.sql`, then `scripts/seed_cohort.py`; use `127.0.0.1` (not `localhost`,
  which stalls on IPv6 on Windows).

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

## Design guide — landing & dashboard (keep this look; it's the calibre judges see)
Shared design language across both pages. Tokens: display font **Sora**, headings **Space Grotesk**,
body **Inter**, mono **IBM Plex Mono**. Glass recipe = translucent white fill + 1px light border +
`backdrop-filter: blur(...)` + soft drop shadow + inset top highlight. Motion is calm and premium
(cubic-bezier ease-out, staggered), never bouncy.

**Landing (`landing.html` / `landing.css`):** full-bleed drone-**video** hero (`campus.mp4`, poster
`campus-hero.jpg`) under a deep-blue overlay; glass top nav (73px logo); the **AURA** robot mascot
top-right of the hero; sections Coverage / The work / Platform / How it works; a dark Vignan footer
(brand + accreditation `badges.png` + team + a subtle video credit line "YouTube: CRAK PRODUCTIONS").
Intro animation is gated on the consent choice (`cc:consent`), immediate for returning visitors.

**Dashboard (`index.html` / `style.css`) — the post-login "command deck":** the two pages **swap
media** — dashboard hero is the campus **image** (`campus.webp`), landing is the video.
- Hero stack (z-order): `.dh-bg` (campus image, `cover`, position `100% 100%`, slow Ken-Burns
  `dhKen`, **no zoom**) → `.dh-veil` (left-weighted dark gradient so copy stays legible, campus
  bright on the right) → glass `.platform-bar` (DB + consumes/feeds lineage) → `.dh-inner`
  (role-switch top, **bottom-anchored** `.dh-copy` = eyebrow + headline + sub + scope, then the
  3D glass **KPI cards**) → `.dh-fade` (fade to page bg).
- KPI cards tilt in 3D on pointer-move (`--rx/--ry`), gold number = the coverage-gap/bad metric.
- **Entrance = "assemble":** the campus image lands first, then overlay elements stagger in
  (`dhAssemble`, delays ~0.54s→1.08s — a deliberate ~0.5s lead-in so it never feels like lag).
  Reduced-motion disables it.
- Sticky tabs pinned below the variable-height header (`--topbar-h` measured in JS); switching
  panels does a directional slide. If the reader is scrolled into the panels, the new tab opens at its own
  top (just under the rail, `panelStartY()`); from the hero the page doesn't move.
- Shared state colours: blue = claimed (money reached them), light blue = applied/in process,
  gold = eligible & unclaimed (the gap), red = rejected, grey = not eligible.
- Chat launcher = big AURA robot with a glow disc + "Any doubts? Ask me!" bubble.

**Non-negotiable motion rule — no layout jump.** Async content (KPIs, hero copy) must **reserve its
final space before data arrives**: skeleton cards in the KPI row + `min-height` on the container,
and `min-height` on `.dh-headline` (2 lines) / `.dh-sub` (3 lines) so filling real text doesn't
shove the bottom-anchored copy upward. Any new async block gets the same treatment.

**Perf rule.** DB access is pooled (`db.py` `ConnectionPool`, always-warm) — never reopen a
connection per request. Hero/KPI fetches run in parallel (`Promise.all`), not sequential awaits.
Locally the DB is the real Cloud SQL via the Auth Proxy (see below), so a fresh connect is slow;
the pool + parallel fetches keep first paint ~1s instead of ~10s.

## Local DB (verify locally against real data)
No Docker/Postgres needed. Tunnel Cloud SQL to localhost with the proxy that ships with gcloud:
`cloud-sql-proxy --port 5432 project-8dde1e00-67da-41c1-9d9:asia-south1:agent42-db`
then run the app; `.env` `DATABASE_URL` points at `localhost:5432/platform` (real prod DB name is
**`platform`**). Chrome blocks ports 5432/5060 for `http://` — use 8080+ for headless checks.

## Deploy
`gcloud run deploy scholarship-agent-42 --source . --project=project-8dde1e00-67da-41c1-9d9 --region=asia-south1 --quiet`
`.env` is git-ignored + `.gcloudignore`-excluded, so prod Cloud SQL + Vertex env survive the build.
Prefer a quick local look first; ask before deploying if unsure.

## Git
Commit granularly, alternating the two teammates (Mounish Sai `mounishsai.ai@gmail.com`,
Ch. V. K. Ranjith Kumar `vu.241fa04806@gmail.com`), each ending with the Claude co-author trailer.
Repo: https://github.com/mounishsai-ai/scholarship-agent-42
