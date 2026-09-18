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
  never originates a number. Works fully offline via templates. At 1000-student scale `_phrase` feeds
  `_compact_payload(intent, …)` (aggregates + ≤25-row sample) — **not** the raw result string; the old
  `json.dumps(payload)[:2500]` sliced large results (e.g. 330 reconciliation rows) mid-JSON and the model
  then under-counted ("the list is cut off"). Roster still capped at `CHAT_STUDENT_LIMIT = 40`.

## Spec coverage (problem statement 42 → where it lives)
1 Scheme register → Scheme Register tab; add (`POST /api/scheme`), edit for the cycle / retire / reinstate
  (`POST /api/scheme/<code>`). 2 Match every student × scheme → `match_matrix`. 3 Notify → `notify_student` /
  `notify_all` (deduped, drafts wait for approval). 4 Application prep → `application_pack` (checklist, pre-filled
  data, `record_checks` format validation, window check). 5 Track + follow up stalled → `applications()`
  (`stalled` per `STALL_DAYS`) + `draft_follow_ups`. 6 Renewal risk → `renewal_risk`. 7 Reconcile + adjust
  ledger → `reconcile` (suppress reminders; `ledger_mismatch`) + `sync_fee_ledger` (writes
  `fee_demand.scholarship_expected`, officer-approved). 8 Coverage / disbursement / rejection analysis →
  `coverage_report`. Nothing decides an award: every student-affecting output waits in the approval queue.
**Academic year = 2026-27.** `seed.sql` / `seed_cohort.py` still write the 2025-26 cycle; run
**`scripts/roll_to_2026_27.sql`** once after seeding (same `ACADEMIC_YEAR_ID`, guarded on the label so a re-run is a
no-op). It moves plan dates (year, term, scheme closing dates, fee due dates) +1 year and maps event dates
(applied/disbursed, payments, reminders) onto 2026-07-01 → today−3 in the same order, so the windows are open,
nothing is dated in the future, and no application predates its window. Attendance snapshot → 2026-09-01; term
results, agentops rows and flags keep their real dates. Known leftover: batch labels are unchanged (22CSE still
shows 4th year). The year label shown in the UI comes from `core.academic_year` (`/api/coverage` → `academic_year`),
never hardcode it. Tested on a throwaway container (all e2e checks pass, stalled 249→114, max wait 440→77 days);
**Applied to prod Cloud SQL on 2026-09-17** (pg_dump backup of the 8 touched tables taken first; live check after:
2026-27, windows open Jul–Dec 2026, 114 stalled, max wait 77 days, no future dates). Auto mode blocks Claude from prod DB
writes, so the user runs such scripts. No psql on this machine — from `scholarship-agent/` in PowerShell, proxy up:
`Get-Content <file>.sql -Raw | docker run --rm -i postgres:16 psql "postgresql://postgres:<pw>@host.docker.internal:5432/platform" -v ON_ERROR_STOP=1`.
Fresh DBs still need the script after seeding; a re-run is a no-op.

## Dashboard sections — exactly what each shows (staff view unless noted)
- **Hero + KPI cards** — from `/api/coverage` + `/api/renewal-risk` + `/api/reconciliation`: coverage gap
  (eligible matches − claimed), eligible matches, claimed (shown as "covered"), renewals at risk, reminders to suppress; sub-line
  uses `students.total`. Student: schemes they qualify for, their application count, renewal status.
- **01 Coverage** (`/api/coverage`, staff only): (a) money ledger — gap = Σ(per-scheme gap × benefit_amount),
  identified = moved + gap, moved = covered × benefit, % moved; (b) student-by-student — one square per
  cohort student, bucket FULL (has an award, no eligible scheme left unapplied) / PARTIAL (award + an eligible
  scheme nobody applied to) / IN_PROGRESS (applied, nothing sanctioned) / UNCLAIMED (eligible, nothing moving
  or only rejected) / NOT_ELIGIBLE; the big bar is over students who qualify for ≥1 scheme; per-batch bars;
  (c) disbursement — sanctioned ₹, paid ₹, sanctioned-not-paid, avg applied→paid days, rejection rate + by
  scheme; (d) per scheme — eligible pairs split claimed / applied / rejected / never applied, gap ₹;
  (e) rejection reasons with counts. "Covered" = application status SANCTIONED or DISBURSED.
  **Gap = eligible − claimed**, where claimed (`total_claimed`, per scheme `eligible_claimed`) counts only awards to
  students who still pass the rules; `total_covered` (every award) stays for the money/disbursement story. Never
  subtract `total_covered` from eligible: an award to a student who no longer qualifies (rules tightened via
  "edit for this cycle") would push the gap negative. Frontend reads `total_claimed ?? total_covered`.
- **02 Eligibility Matrix** (`/api/matrix`): ladder per scheme — Eligible (all rules pass) → Applied (eligible
  and any application, incl. rejected) → Claimed (eligible and sanctioned/disbursed); each number filters the
  list. List: every student × scheme cell with its state NOT_ELIGIBLE / ELIGIBLE / APPLIED / CLAIMED / REJECTED
  (`cell_state`), searchable, filter by state / scheme / batch, 25 per page; a cell opens the rule trace
  (each rule, the student's value, pass/fail) + "Draft notice" (eligible, not applied) + application pack.
  "Draft notices" drafts one per eligible-unapplied pair. Student: one card per scheme with their state and
  rule trace.
- **03 Application Tracker** (`/api/applications` + coverage for "never applied"): stage cards Submitted →
  Verified (INSTITUTION_VERIFIED) → Sanctioned → Paid (DISBURSED) with counts and ₹; off-ramps: rejected,
  stalled (older than `STALL_DAYS` at its stage), eligible matches never applied (Σ `eligible_unapplied`);
  "Draft follow-ups" for stalled cases. List rows: student, scheme + application no + applied date, 4-dot
  stage track, stalled days, rejection reason, sanctioned/paid ₹. Student: a stepper card per application
  plus schemes they qualify for but haven't applied to.
- **04 Renewal Risk** (`/api/renewal-risk`): SANCTIONED/DISBURSED awards of renewable schemes, checked
  against `renewal_criteria` (attendance ≥ 75, MCM also CGPA ≥ 6.5). AT_RISK / LIKELY_LOSS (gap > 10 pts)
  rows first, plotted on a 55–100% attendance axis with the floor; ₹ at stake = sanctioned amount; the
  on-track awards are folded behind "Show them". Each at-risk award has an open SCHOLARSHIP_RISK flag.
- **05 Fee Reconciliation** (`/api/reconciliation`): every live award against the student's fee demand —
  covered ₹, fee outstanding, what the ledger expects (`scholarship_expected`, should equal min(live awards,
  gross fee)), active reminder. Cards = needs a human (suppression recommended: reminder active and covered ≥
  outstanding > 0; ledger mismatch; reminder active); "Approve suppression" per card; "Approve ledger sync"
  when mismatches exist; the reconciled rest is a paged table.
- **06 Scheme Register** (`/api/schemes`, staff `?all=1` incl. retired): provider, benefit type/amount,
  window, machine rules, documents, renewal conditions, "students match" (coverage eligible count);
  officer: add / edit for this cycle / retire / reinstate.
- **07 Agent Activity** (`/api/runs`, `/api/approvals`, plus cached panels): replayed trace of the
  detect → decide → act → measure loop (figures read from the other endpoints); approval queue (8 newest of
  `total`, bulk approve for notices / follow-ups — suppression & ledger stay one by one); audit trail of the
  last 15 `agent_run`s (inputs → outputs, latency).
- **08 Integrations** (`/api/integrations`): live DB provider / instance / server clock, schema & table
  counts, live row counts of the shared tables read, consumes Agents 10 (term_result) & 11
  (attendance_summary), feeds 40 (fee_demand), 41 (reminder_dispatch), 43 (scholarship_application), and the
  last 12 provenance rows (`agent_run_input`).
- **Roles**: Officer = all tabs + actions; HoD = read-only (no Activity); Accounts = coverage, tracker,
  reconciliation, activity, integrations; Student (register-number login) = matrix, tracker, renewal,
  schemes — own rows only, enforced server-side. Guest can preview every role.

## Dashboard v2 data-viz redesign (shipped 2026-09-18, revision 00042)
The seven tab bodies were re-cut for a non-technical judge (design handoff *"Agent 42 Dashboard v2"*), all
in **`upgrade.js` + `upgrade.css`**; Integrations is unchanged. Every figure is still computed live — the
handoff's literal numbers were a stale snapshot, so **numerals are bindings, never hardcoded copy**.
- **Coverage**: gap summary (₹ unclaimed + moved/unclaimed ribbon) → scheme-by-scheme segmented bars
  (segment <3.5% spills to a dot-chip under the bar) → disbursement **donut** (blue paid / gold awaiting,
  arc dash computed from `disbursed/sanctioned`) + rejection reasons. The old waffle (1 square/student) and
  by-batch section were **dropped** per the prototype.
- **Matrix**: opens on the horizontal legend; column headers are scheme **display names, never codes**; cell
  trace eyebrow "Why" + verdict "Qualifies — worth ₹X. <state>"; footer "Draft notices" CTA. Ladder removed.
- **Tracker**: list-first (stage chips + 4-dot stage track), compressed
  funnel (**display-only**, no `data-a42-stage`, does not filter) + stalled / never-applied off-ramps at the bottom.
  Stage dots (`stageDots` in `upgrade.js`) match the prototype (`Agent 42 Dashboard v2.dc.html`): filled up to the
  current stage, **green `#12a150` once the whole track is Paid (`at===3`)**, uniform blue `#3f68ea` while in
  progress, hollow after; a rejected row shows one red dot. In-progress rows carry a **"N days in this stage"**
  sub-line (`days_waiting`); paid rows show none, rejected show the reason. (The earlier graduated-blue `STAGE_COLOR`
  ramp is now used only by the bottom funnel ribbon, not the row dots. Shipped rev 00044, 2026-09-18.)
- **Renewal**: at-risk action list first (attendance bar = fill→attendance%, gold shortfall→75% tick), then a
  273-award attendance **histogram** (9 buckets 55–100, "75% NEEDED" marker at 44.44%) + safe strip.
- **Reconciliation**: approval list ("Outstanding on the fee bill" vs "Agent 40 ledger expects") + "What the
  check found" tiles (awards checked / reminders to stop / ledger mismatches / wrongly chased ₹).
- **Scheme Register**: one-per-row cards, eligibility + renewal rendered in **plain language**
  (`plainRule`/`plainRenewal` in upgrade.js) — the stored rules stay machine-evaluable JSON, this is a
  display layer only. "+ Add scheme" (right-aligned) opens `openSchemeModal`.
- **Agent Activity**: **light-blue** trace console (was dark navy; the dark-bg trace inks are remapped to
  dark variants via `CMAP` at the end of `buildTrace`), compressed phase strip, audit table
  (Trigger / Request / Tables read / Took — Status column removed).
- **Two chrome changes** (in `index.html` / `style.css`, NOT the upgrade layer): `.platform-bar` → thin
  tinted glass (`rgba(9,18,44,.06)`, `blur(2.5px) saturate(120%)`); `.avatar` → `#9cbcfd` on `#12224e`.
- The **"What this proves"** claim strip that `syncRail` injected was removed from every tab.
- **Honest nouns (no-bluffing)**: `coverage_gap`/`total_eligible` (565/895) are student×scheme *matches*, not
  students (only 569 students actually qualify). The UI says "eligible student–scheme matches", never
  "students", on the Coverage gap line and the Matrix/Tracker "never applied" counts. Do not revert to "students".

## Landing sign-in (2026-09-18)
Register-number login (username = reg no, first password = reg no) is now surfaced **directly in the hero**
(`.hero-signin`, `mode=regid`) next to Google + Guest, not hidden behind "More options →" (which still opens
the full method modal). All 1000 students can sign in. Removed the "YouTube: CRAK PRODUCTIONS" footer credit
line entirely (landing.html + `.footer-credit` CSS).
The hero **coverage meter-card** is deliberately kept as-is (the signature). A round of "remove the card / centre
the copy / glassy panel" experiments was tried and **rolled back**; that WIP is parked outside the deploy folder at
`../_card_design_wip/{landing.html,landing.css}.cardwip` — restore from there if we revisit it, don't redo from scratch.

## Scale rules (1000 students — keep it this way)
- No per-row DB round-trips: batch facts (`get_students` once), bulk writes (`executemany`). Renewal risk rows
  are written once per award per day and a flag only if no identical OPEN flag exists.
- Never put `crypt()` in a WHERE over many rows (it bcrypts every account) — find the row first.
- JSON is gzipped in `after_request`; `/api/matrix` cells are slim (state + rule trace, no prose).
- Long lists are searched/filtered/paged (`PAGE = 25`, `PAGERS` in `upgrade.js`), never 1000 animated nodes.
- A register-number session is scoped **server-side** (`_student_scope`, `_staff_only`): own rows only,
  staff endpoints 403 — the frontend must not call staff endpoints for a locked student.
- Local test DB: `docker run -d --name a42pg -e POSTGRES_PASSWORD=local -e POSTGRES_DB=platform -p 55432:5432 postgres:16`,
  load `schema/schema_full.sql`, `seed.sql`, then `scripts/seed_cohort.py`, then `scripts/roll_to_2026_27.sql`; use `127.0.0.1` (not `localhost`,
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
`campus-hero.jpg`) under a deep-blue overlay. `campus.mp4` is the user's AI-detailed edit ("final video 6.mp4")
copied byte-for-byte — **never re-compress it**; bump the `?v=` in `landing.html` on every swap.
Loop is JS, not `loop`: at the end the video hides (`.is-dark`) over a black `.hero-video-wrap`, 0.5s of dark,
then restarts — no fades (user's call); glass top nav (73px logo); the **AURA** robot mascot
top-right of the hero; sections Coverage / The work / Platform / How it works; a dark Vignan footer
(brand + accreditation `badges.png` + team).
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
- Chat launcher = big AURA robot with a glow disc + a pulsing **chat-bubble badge** (`.cl-badge`, bottom-right of
  the bot) + recurring "Any doubts? Ask me!" bubble. No text label (the old "Ask AURA" pill was dropped — the badge
  is what signals "this is a chat"). Keep the bot; judges weren't noticing it as clickable without the badge.
- Dashboard hero has a **scroll cue** (`.dash-scrollcue`, bottom-centre) that scrolls to `panelStartY()` — the
  hero fills the screen, so it signals the live dashboard is below. The old "Swipe, drag… move between sections"
  hint pill was removed (the ‹ › `.sec-arrow` buttons stay).

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
Prefer a quick local look first; ask before deploying if unsure. Run it **from `scholarship-agent/`** — from the parent folder the upload
has no Dockerfile (buildpacks fail, and `.env` leaks into the upload since `.gcloudignore` isn't applied).
`.claude/settings.json` allows Claude to run this deploy. The default gcloud project on this machine is
a different one (`placement-agent-22587`), so always pass `--project` (also for `gcloud run revisions list`).
Verify after a deploy: live `/api/coverage` must carry `students`, `total_claimed`, `academic_year` — if it
doesn't, prod is on an old build (that is what caused the "−102 unclaimed" / "₹0 gap" hero on 2026-09-17).

## Git
Commit granularly, alternating the two teammates (Mounish Sai `mounishsai.ai@gmail.com`,
Ch. V. K. Ranjith Kumar `vu.241fa04806@gmail.com`), each ending with the Claude co-author trailer.
Repo: https://github.com/mounishsai-ai/scholarship-agent-42
