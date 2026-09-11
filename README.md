# Scholarship Agent — Agent 42

**Agentic AI Day 2026 · Vignan University · CSE**

Agent 42 of the 72-agent academic platform. It makes sure every student gets every
scholarship they are eligible for, no application lapses on a deadline, no renewal is
lost to a fixable attendance dip, and no student is chased for fees a scholarship
already covers.

It is a **standalone website that runs on the shared platform database**, so it demos
on its own today and plugs into the full platform tomorrow with one connection-string
change.

---

## What it does (the five things judges will look for)

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
Browser (dashboard + Buji-style chat)     templates/ , static/
        │  fetch JSON
Flask web server                          app.py
        │  calls one function per request
Reasoning engine (the brain)              scholarship_engine.py
        │  reads/writes through one helper
Postgres connection helper                db.py
        │
Shared platform database (Supabase)       ../files/*.sql  +  seed.sql
```

- **`db.py`** — the single doorway to Postgres.
- **`scholarship_engine.py`** — the deterministic logic. `evaluate()` walks each scheme's
  JSON rules and records the working for every rule. No number is ever guessed.
- **`app.py`** — thin Flask routes; each calls one engine function. `/api/chat` is the only
  place Gemini is used, and only to phrase numbers the engine already computed.
- **`seed.sql`** — the demo world, built around three stories (below).

---

## Setup (about 30–40 minutes)

### 1. Create the database on Supabase (free)
1. Go to supabase.com → new project. Save the database password.
2. Open **SQL Editor**. Run this once:
   ```sql
   create extension if not exists pgcrypto;
   ```
3. Load the platform schema: open `../files/schema_full.sql`, paste the whole file into
   the SQL editor, and run it. (Or run `01_…sql` through `12_…sql` in order.)
4. Load the demo data: paste and run `seed.sql` from this folder. The last query should
   list twenty students `23CSE001`–`23CSE020` with CGPA and attendance — that means it worked.
   (Easy to scale further: copy the last student block and bump the numbers.)

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

## Two honest notes for the judges

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
