# Scholarship Agent — Agent 42

**Agentic AI Day 2026 · Vignan University · CSE**

![Python](https://img.shields.io/badge/Python-3-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-Vertex%20AI-8E75B2?logo=googlegemini&logoColor=white)
![Cloud Run](https://img.shields.io/badge/Google%20Cloud%20Run-deployed-4285F4?logo=googlecloud&logoColor=white)

**▶ Live demo:** https://scholarship-agent-42-1031611339150.asia-south1.run.app
Sign in with a register number (e.g. `23CSE001`; first password = the register number).
All student data is synthetic.

**Highlights**
- A deterministic rules engine matches a **1,000-student cohort** against every scholarship scheme
  and records the *why* behind every decision. The LLM phrases answers but never produces a number.
- A real agentic loop (**detect → decide → act → measure**) with a full audit trail and
  **human-approval gates** on anything that touches a student.
- Integrates with other agents only through a **shared PostgreSQL database** (no service-to-service calls).
- Role-scoped sign-in: students see only their own rows, enforced server-side.

Agent 42 of the 72-agent academic platform. It makes sure every student gets every
scholarship they are eligible for, no application lapses on a deadline, no renewal is
lost to a fixable attendance dip, and no student is chased for fees a scholarship
already covers.

It is a **standalone website that runs on the shared platform database**, so it demos
on its own today and plugs into the full platform tomorrow with one connection-string
change.

---

## What it does

| Screen | What it proves |
|---|---|
| **Coverage** | The headline: eligible vs covered, and the gap to close. |
| **Eligibility Matrix** | Every student × every scheme, with a **Why?** button showing the exact rule that passed or failed. |
| **Application Tracker** | Applications across DRAFT → SUBMITTED → VERIFIED → SANCTIONED → DISBURSED. |
| **Renewal Risk** | Live scholarships checked against renewal rules; at-risk cases raise a `SCHOLARSHIP_RISK` flag. |
| **Fee Reconciliation** | Disbursements matched to the fee ledger; reminders that should be suppressed, with a **human approval** button. |
| **Agent Activity** | The audit trail — every run, its inputs and outputs, open flags, and the approval queue. |

Every action is logged to the `agentops` tables (run → output → risk flag → human review).
That evidence trail is what makes this an **agent**, not a CRUD app.

---

## Architecture (one screen, top to bottom)

```
Browser (dashboard + AURA chat)           templates/ , static/
        │  fetch JSON
Flask web server                          app.py
        │  calls one function per request
Reasoning engine (the brain)              scholarship_engine.py
        │  reads/writes through one helper
Postgres connection helper                db.py
        │
Shared platform database (Postgres)       schema/  +  seed.sql  +  scripts/
```

- **`db.py`** — the single doorway to Postgres.
- **`scholarship_engine.py`** — the deterministic logic. `evaluate()` walks each scheme's
  JSON rules and records the working for every rule. No number is ever guessed.
- **`app.py`** — thin Flask routes; each calls one engine function. `/api/chat` is the only
  place Gemini is used, and only to phrase numbers the engine already computed.
- **`seed.sql`** — the demo world, built around three stories (below).
- **`scripts/seed_cohort.py`** — seeds the 1,000-student cohort (22CSE–25CSE, deterministic, re-runnable).

---

## End-to-End (how it actually works)

> The mechanism-level version: what is **automated**, what is **human-in-the-loop**,
> and what is **demo-modeled**.

### The core idea in one paragraph
72 agents share **one PostgreSQL database**. No agent calls another agent's code or website —
they *integrate by reading and writing the same tables*. Agent 42 **reads** what Agents 10
(academic performance) and 11 (attendance) put in the DB, and **writes** facts that Agents 40
(fee management), 41 (fee reminders) and 43 (education-loan docs) read out of it. "Input / output"
= which shared tables we read vs write. Every figure the UI shows is computed **deterministically in
SQL/Python** — the LLM (Gemini) only *phrases* answers, it never originates a number.

### Request lifecycle (every screen)
```
Browser  --fetch /api/x-->  Flask (app.py)  --one call-->  scholarship_engine.py
                                                             │  evaluate() / match / reconcile …
                                                             ▼
                                                  db.py → shared Postgres (Cloud SQL in prod)
                                                             │  writes an audit trail as it goes:
                                              agentops.agent_run → agent_run_input (provenance)
                                                      → agent_output (reasoning_summary) → risk_flag
```
Each API route calls exactly one engine function; reads go through the **views**
(`people.v_student_profile`, `attendance.v_current_attendance`), not base tables.

### The agentic loop (what makes it not CRUD): detect → decide → act → measure
1. **Detect** — a scheduled/triggered sweep reads the shared data (e.g. every live scholarship's
   current attendance vs its renewal rule).
2. **Decide** — the deterministic engine evaluates rules and records the *working* (which rule
   passed/failed) as the `reasoning_summary`.
3. **Act** — anything that touches a student (notify, suppress a reminder, sanction) is a
   **Class-3 action: it waits for a human to approve** in the approval queue, then writes the result
   to the shared DB.
4. **Measure** — coverage %, gap, rejection reasons; the loop is auditable end to end via `agentops`.

### End-to-end flow #1 — an officer registers a new scheme
1. **Scheme Register → "+ Add scheme"**: officer enters code, name, provider, benefit, application
   window, required documents, renewable?, and **eligibility rules** (e.g. `income ≤ 250000`,
   `cgpa ≥ 7`, `category in [SC,ST]`, `gender = F`).
2. `POST /api/scheme → create_scheme()` inserts one row into `finance.scholarship_scheme` with the
   rules stored as JSONB, and logs an `agent_run`.
3. **Instantly, no extra work:** on the next read, `evaluate()` walks each rule against every one of
   the cohort's facts → the scheme appears in the **Eligibility Matrix**, **Coverage** recomputes
   the gap, and each matching student becomes "eligible" (with a **Why?** listing the rules that
   passed). *This is spec workflow-step 2 — "match every student against every scheme" — made live.*
4. Downstream unlocks for that scheme: notify → prepare pack → track → renewal → reconcile.

### End-to-end flow #2 — fee reconciliation → suppress a reminder
1. `reconcile()` joins `scholarship_application → fee_demand → reminder_dispatch`.
   - **Covered** = amount *disbursed* (or *sanctioned* if not yet paid). **Outstanding** = fee still
     due on the ledger.
   - It **recommends** suppression when `there is an active reminder AND covered ≥ outstanding > 0`.
2. It does **not** auto-suppress — governance requires a human, because this affects a student's
   money and communications. The officer clicks **Suppress reminder** (approval gate).
3. `suppress_reminder()` runs `UPDATE finance.reminder_dispatch SET suppressed = true …` **in the
   shared DB**. Agent 41 (Fee Due Reminder) **reads that flag** and stops chasing. That's the entire
   "feeds Agent 41" integration — a shared-table write, not an API call.

### End-to-end flow #3 — renewal risk
`renewal_risk()` reads each live award's current attendance/CGPA (from Agents 10/11's shared data),
compares to the scheme's `renewal_criteria`, assigns a level (`NONE / WATCH / AT_RISK / LIKELY_LOSS`),
persists a `scholarship_renewal_risk` row, and raises a `SCHOLARSHIP_RISK` `risk_flag` **before** the
award lapses — the "catch it while there's still time" beat.

### End-to-end flow #4 — the chat (AURA)
`/api/chat` is the only place Gemini is used. A rule-based router picks the right engine function;
Gemini phrases the **engine's** numbers over the data context. With no key / no internet it falls
back to deterministic templates — so a network failure changes wording, never the answer. Role
scoping is enforced (a student can only see their own record).

### What's automated vs manual vs demo-modeled
| Piece | Reality |
|---|---|
| Eligibility matching, coverage, renewal detection, reconciliation math | **Fully automated & deterministic** — computed from the JSONB rules + shared data. |
| Notifying, suppressing reminders, sanctioning | **Automated recommendation, human-approved** (Class-3 approval gate). |
| Document checklist | List is **auto** (from the scheme's `required_documents`); the tick-boxes are a **manual** "collected" tracker (institution-held docs could be pre-ticked — enhancement). |
| Application status feed (submitted→…→disbursed) | Table is the system of record; in the **real world** a scholarship-section staffer (or a future NSP-portal ingestion) updates it — govt data arrives as portal logins / emails / PDFs, no clean API. Seeded here for the demo. |
| Agents 10 & 11 (inputs) | **Stubbed** — owned by other teams; we read their shared views directly and label them stubbed. |

### Stack & deployment
- **Flask + vanilla HTML/CSS/JS** (no build step); GSAP + Lenis vendored for offline reliability.
- **PostgreSQL** — Cloud SQL in prod (unix socket), local Postgres in dev.
- **Gemini 3.8-flash via Vertex AI** (ADC, no API key), location `global`.
- **Deploy:** `gcloud run deploy scholarship-agent-42 --source . --project=… --region=asia-south1`.
  `.env` is git-ignored and `.gcloudignore`-excluded, so prod's `DATABASE_URL` + Vertex env are
  never clobbered by the build.

---

## Setup (about 30–40 minutes)

### 1. Create the database on Supabase (free)
1. Go to supabase.com → new project. Save the database password.
2. Open **SQL Editor**. Run this once:
   ```sql
   create extension if not exists pgcrypto;
   ```
3. Load the platform schema: open `schema/schema_full.sql`, paste the whole file into
   the SQL editor, and run it.
4. Load the demo data: paste and run `seed.sql` from this folder. The last query should
   list the hand-written demo students `23CSE001`–`23CSE020` with CGPA and attendance.
5. Seed the full 1,000-student cohort, then roll it to the current academic year
   (after step 2 below, once `DATABASE_URL` is in `.env`):
   ```bash
   python scripts/seed_cohort.py
   # then run scripts/roll_to_2026_27.sql in the SQL editor
   ```

> Prefer local? `docker run -d --name a42pg -e POSTGRES_PASSWORD=local -e POSTGRES_DB=platform -p 55432:5432 postgres:16`,
> load the same files in the same order, and point `DATABASE_URL` at `127.0.0.1:55432`.

### 2. Get the connection string
Supabase → **Project Settings → Database → Connection string → URI**. It looks like:
```
postgresql://postgres:YOUR-PASSWORD@db.xxxxxxxx.supabase.co:5432/postgres
```

### 3. Configure and run the app
```bash
cd scholarship-agent
python -m venv .venv
.venv\Scripts\activate            # Windows PowerShell:  .venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env            # then edit .env:
#   DATABASE_URL = the URI from step 2
#   GEMINI_API_KEY = optional (leave blank to run fully offline)

python app.py
```
Open **http://localhost:5000**.

### 4. (Optional) Gemini chat
The chat box works with **no key** (rule-based, offline-safe). To make its wording
nicer, put a Google AI Studio key in `GEMINI_API_KEY` in `.env`. Numbers still come
from the engine, so a wifi failure at 2 PM only changes phrasing, never the demo.

---

## The three demo stories (seeded on purpose)

1. **Priya (23CSE001)** — SC, family income ₹1,80,000, CGPA 8.2. Open the **Eligibility
   Matrix**: she qualifies for schemes she never applied to. *"The value is the scholarship
   nobody told her about."*
2. **Arjun (23CSE002)** — has a **sanctioned** Merit-cum-Means scholarship, but attendance
   fell to 68%. Open **Renewal Risk**: he is `AT_RISK` and a flag is raised — *while there is
   still time to fix it.*
3. **Fatima (23CSE003)** — her EWS scholarship is **disbursed** and covers her fee, yet a
   reminder is still being sent. Open **Fee Reconciliation**: the agent recommends suppressing
   it and quotes the platform's own rule. Click **Suppress reminder** to approve. *This is the
   most common cause of avoidable distress in fee follow-up — and it's fixed here.*

---

## How it fits the platform (Agent 42's declared integrations)

The spec defines Agent 42 as *"Consumes Agents 10, 11. Feeds Agents 40, 41, 43."* We honour that:

| Direction | Agent | How |
|---|---|---|
| Consumes | **11 Attendance** | reads attendance % from the shared attendance view (renewal checks). |
| Consumes | **10 Academic Performance** | reads CGPA / backlogs from the student-profile view (merit rules). |
| Feeds | **40 Fee Management** | writes/uses `fee_demand.scholarship_expected`; reconciles disbursements. |
| Feeds | **41 Fee Reminder** | recommends which fee reminders to suppress once a scholarship covers dues. |
| Feeds | **43 Education Loan** | exposes fee-paid / disbursement status a loan agent needs. |

Agents 10 and 11 belong to other teams, so we read their published data and label it as a stub —
we did not fake building them.

## Design notes

- **Upstream agents are stubbed.** Agents 10 (academic performance) and 11 (attendance) are
  *declared inputs* owned by other teams. We read their data directly from the shared views and
  label it as stubbed — we did not fake building them.
- **Category is used lawfully.** `people.person.social_category` must never be a machine-learning
  feature (the schema says so). We use it only as a **statutory scholarship rule**, exactly as
  government schemes require — not as a prediction input.

---

## Team
- Mounish Sai
- Ch. V. K. Ranjith Kumar
