"""
Scale the demo cohort to 1000 CSE students and give every student a sign-in.

    python scripts/seed_cohort.py            # uses DATABASE_URL (.env)

Run AFTER schema_full.sql + seed.sql. Deterministic (fixed random seed, UUIDs
derived from the register number) and re-runnable: every insert is ON CONFLICT
DO NOTHING, so a second run changes nothing and never resets a password a
student has already changed.

What it adds
  * 4 batches x 250 students: 22CSE001-250 (Year 4) ... 25CSE001-250 (Year 1).
    The hand-written 23CSE001-020 demo students (Priya, Arjun, Fatima, ...) are
    kept exactly as seed.sql made them.
  * For each new student: person, student, guardian (income), term result
    (CGPA/backlogs, Agent 10's table) and a term attendance aggregate (Agent 11's).
  * Applications ONLY where the engine's own evaluator says the student is
    eligible, so coverage can never exceed 100% or go negative.
  * Fee demands for every new student, and a handful of reminders still chasing
    fees a scholarship already covers (what reconciliation should catch).
  * identity.app_user for all 1000 (username = register number) and a bcrypt
    credential in identity.agent42_credential (password = register number).
"""
from __future__ import annotations

import os
import random
import sys
import uuid
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import get_conn  # noqa: E402
import scholarship_engine as engine  # noqa: E402
from accounts import CREDENTIAL_DDL  # noqa: E402

NS = uuid.UUID("a4200000-0000-0000-1000-000000000000")
INSTITUTION = "a4200000-0000-0000-0000-000000000001"
PROGRAMME = "a4200000-0000-0000-0000-000000000030"
R23 = "a4200000-0000-0000-0000-000000000031"
TERM = "a4200000-0000-0000-0000-000000000021"
YEAR = engine.ACADEMIC_YEAR_ID
STUDENT_ROLE = "a4200000-0000-0000-0000-000000000f03"
EXISTING_BATCH_2023 = "a4200000-0000-0000-0000-000000000032"
EXISTING_SECTION_2023_A = "a4200000-0000-0000-0000-000000000033"

PER_BATCH = 250
SECTIONS = "ABCD"
BATCHES = {2022: 4, 2023: 3, 2024: 2, 2025: 1}   # admission year -> year of study
HAND_WRITTEN = {f"23CSE{i:03d}" for i in range(1, 21)}


def uid(kind: str, key: str) -> str:
    return str(uuid.uuid5(NS, f"{kind}:{key}"))


FIRST_F = ["Aishwarya", "Ananya", "Bhavana", "Chandana", "Deepika", "Divya", "Harika", "Hema",
           "Jahnavi", "Keerthi", "Lavanya", "Likhitha", "Madhuri", "Manasa", "Meghana", "Mounika",
           "Navya", "Nikhila", "Pallavi", "Pooja", "Pranathi", "Priyanka", "Ramya", "Sahithi",
           "Sai Priya", "Sandhya", "Shreya", "Sindhu", "Sneha", "Sravani", "Swathi", "Tejaswini",
           "Varsha", "Vyshnavi", "Yamini", "Zoya", "Ayesha", "Fathima", "Nandini", "Revathi"]
FIRST_M = ["Abhinav", "Aditya", "Akhil", "Arjun", "Bharath", "Charan", "Chaitanya", "Dinesh",
           "Ganesh", "Harsha", "Hemanth", "Jaswanth", "Karthik", "Kiran", "Lokesh", "Mahesh",
           "Manoj", "Mohan", "Naveen", "Nikhil", "Pavan", "Praveen", "Rahul", "Rakesh", "Ravi Teja",
           "Rohith", "Sai Kiran", "Sandeep", "Srikanth", "Sujith", "Tarun", "Teja", "Uday",
           "Varun", "Venkat", "Vamsi", "Yaswanth", "Imran", "Salman", "Joseph"]
SURNAMES = ["Reddy", "Naidu", "Rao", "Chowdary", "Varma", "Sharma", "Kumar", "Goud", "Yadav",
            "Raju", "Babu", "Prasad", "Shaik", "Syed", "Pasupuleti", "Kondapalli", "Gorantla",
            "Bandaru", "Vemula", "Nallapati", "Kotha", "Chitturi", "Pericherla", "Tummala",
            "Mandava", "Jonnalagadda", "Kancharla", "Mekala", "Dasari", "Pydi", "Mulpuri",
            "Addanki", "Thota", "Mallela", "Katta", "Devarapalli", "Singh", "Iyer", "Nair", "Das"]
CATEGORY_WEIGHTS = [("GENERAL", 34), ("OBC", 30), ("SC", 16), ("ST", 7), ("EWS", 13)]
INCOME_BAND = {                      # (low, high) in rupees, per category
    "SC": (60_000, 420_000), "ST": (50_000, 380_000), "OBC": (90_000, 900_000),
    "EWS": (120_000, 820_000), "GENERAL": (180_000, 2_400_000),
}
CORE_SCHEMES = {                     # code -> (chance an eligible student applied, app no prefix)
    "PMS_SCST": (0.74, "PMS"), "MCM_STATE": (0.52, "MCM"),
    "EWS_INST": (0.66, "EWS"), "PRAGATI_AICTE": (0.46, "PRG"),
}
STATUS_WEIGHTS = [("SUBMITTED", 12), ("INSTITUTION_VERIFIED", 11), ("SANCTIONED", 27),
                  ("DISBURSED", 40), ("REJECTED", 10)]
REJECTION_REASONS = [
    "Income certificate older than the permitted six months",
    "Bank account not seeded with Aadhaar for DBT",
    "Name mismatch between caste certificate and admission record",
    "Previous-year marksheet not attested",
    "Application submitted after the portal deadline",
]
TUITION = 145_000


def band_for(pct: float) -> tuple[str, str]:
    if pct >= 75: return "GTE_75", "NONE"
    if pct >= 70: return "B70_75", "WATCH"
    if pct >= 65: return "B65_70", "AT_RISK"
    if pct >= 60: return "B60_65", "AT_RISK"
    if pct >= 50: return "B50_60", "CRITICAL"
    return "LT_50", "CRITICAL"


def weighted(rng, pairs):
    return rng.choices([p[0] for p in pairs], weights=[p[1] for p in pairs])[0]


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def build_students(rng):
    """Deterministic synthetic cohort (everything except the hand-written 20)."""
    out = []
    for adm_year, yos in BATCHES.items():
        yy = adm_year % 100
        for n in range(1, PER_BATCH + 1):
            roll = f"{yy}CSE{n:03d}"
            # draw every attribute even for the hand-written 20, so the stream of
            # random numbers (and therefore everyone else's data) never shifts
            female = rng.random() < 0.44
            first = rng.choice(FIRST_F if female else FIRST_M)
            last = rng.choice(SURNAMES)
            cat = weighted(rng, CATEGORY_WEIGHTS)
            lo, hi = INCOME_BAND[cat]
            income = round(lo + (hi - lo) * (rng.random() ** 1.7), -3)
            cgpa = round(clamp(rng.gauss(7.6, 0.9), 5.2, 9.9), 2)
            backlogs = (rng.randint(1, 3) if cgpa < 6.5
                        else (1 if cgpa < 7.0 and rng.random() < 0.4 else 0))
            att = round(clamp(rng.gauss(85, 6), 58, 99))
            parent = rng.choice(["FATHER", "FATHER", "FATHER", "MOTHER"])
            if roll in HAND_WRITTEN:
                continue
            section = SECTIONS[(n - 1) * len(SECTIONS) // PER_BATCH]
            out.append({
                "roll": roll, "adm_year": adm_year, "yos": yos, "section": section, "n": n,
                "name": f"{first} {last}", "gender": "F" if female else "M", "category": cat,
                "income": income, "cgpa": cgpa, "backlogs": backlogs, "attendance": att,
                "guardian": f"{rng.choice(FIRST_F if parent == 'MOTHER' else FIRST_M)} {last}",
                "relation": parent,
                "person_id": uid("person", roll), "student_id": uid("student", roll),
            })
    return out


# Resolved from the database after the structure is seeded (an existing batch or
# section keeps its own id; only missing ones get ours).
BATCH_IDS: dict[int, str] = {}
SECTION_IDS: dict[tuple[int, str], str] = {}


def batch_id(adm_year):
    return BATCH_IDS[adm_year]


def section_id(adm_year, code):
    return SECTION_IDS[(adm_year, code)]


def seed_structure(cur):
    cur.execute("""INSERT INTO curriculum.regulation (regulation_id, institution_id, code, name,
                     effective_from_admission_year, effective_to_admission_year, status)
                   VALUES (%s, %s, 'R20', 'Regulation 2020', 2020, 2022, 'ACTIVE')
                   ON CONFLICT DO NOTHING""", (uid("regulation", "R20"), INSTITUTION))
    cur.execute("SELECT regulation_id FROM curriculum.regulation WHERE institution_id = %s AND code = 'R20'",
                (INSTITUTION,))
    r20 = str(cur.fetchone()["regulation_id"])
    for adm_year, yos in BATCHES.items():
        cur.execute("""INSERT INTO curriculum.batch (batch_id, programme_id, regulation_id,
                         admission_year, label, expected_graduation_year)
                       VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
                    (EXISTING_BATCH_2023 if adm_year == 2023 else uid("batch", str(adm_year)),
                     PROGRAMME, r20 if adm_year < 2023 else R23,
                     adm_year, f"{adm_year}-{(adm_year + 4) % 100:02d} CSE", adm_year + 4))
        cur.execute("SELECT batch_id FROM curriculum.batch WHERE programme_id = %s AND admission_year = %s",
                    (PROGRAMME, adm_year))
        BATCH_IDS[adm_year] = str(cur.fetchone()["batch_id"])
        for code in SECTIONS:
            cur.execute("""INSERT INTO curriculum.section (section_id, batch_id, code, year_of_study, strength)
                           VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
                        (EXISTING_SECTION_2023_A if (adm_year, code) == (2023, "A")
                         else uid("section", f"{adm_year}{code}"),
                         BATCH_IDS[adm_year], code, yos, 63))
            cur.execute("""SELECT section_id FROM curriculum.section
                           WHERE batch_id = %s AND code = %s AND year_of_study = %s""",
                        (BATCH_IDS[adm_year], code, yos))
            SECTION_IDS[(adm_year, code)] = str(cur.fetchone()["section_id"])
    # the real intake now that the cohort is full size
    cur.execute("UPDATE curriculum.programme SET sanctioned_intake = %s WHERE programme_id = %s",
                (PER_BATCH, PROGRAMME))
    cur.execute("UPDATE curriculum.section SET strength = 63 WHERE section_id = %s",
                (EXISTING_SECTION_2023_A,))


def seed_people(cur, students):
    cur.executemany(
        """INSERT INTO people.person (person_id, institution_id, full_name, gender,
             social_category, primary_email)
           VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
        [(s["person_id"], INSTITUTION, s["name"], s["gender"], s["category"],
          s["roll"].lower() + "@vignan.edu") for s in students])
    cur.executemany(
        """INSERT INTO people.student (student_id, person_id, admission_no, roll_no, register_no,
             batch_id, admission_date, current_section_id, current_year_of_study)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
        [(s["student_id"], s["person_id"], f"ADM{s['adm_year']}{s['n']:03d}", s["roll"], s["roll"],
          batch_id(s["adm_year"]), date(s["adm_year"], 8, 1),
          section_id(s["adm_year"], s["section"]), s["yos"]) for s in students])
    cur.executemany(
        """INSERT INTO people.guardian (guardian_id, student_id, name, relation, annual_income,
             is_primary_contact)
           VALUES (%s, %s, %s, %s, %s, true) ON CONFLICT DO NOTHING""",
        [(uid("guardian", s["roll"]), s["student_id"], s["guardian"], s["relation"], s["income"])
         for s in students])
    cur.executemany(
        """INSERT INTO assessment.term_result (student_id, term_id, credits_registered,
             credits_earned, sgpa, cgpa, backlog_count, promotion_status, published_on)
           VALUES (%s, %s, 22, %s, %s, %s, %s, 'PROMOTED', '2026-01-20')
           ON CONFLICT (student_id, term_id) DO NOTHING""",
        [(s["student_id"], TERM, 22 - 2 * s["backlogs"], s["cgpa"], s["cgpa"], s["backlogs"])
         for s in students])
    rows = []
    for s in students:
        band, risk = band_for(s["attendance"])
        rows.append((uid("attendance", s["roll"]), s["student_id"], TERM, s["attendance"],
                     s["attendance"], s["attendance"], band, risk))
    cur.executemany(
        # explicit id: the natural key holds a NULL (term aggregate), so only the
        # primary key can make a re-run a no-op
        """INSERT INTO attendance.attendance_summary (attendance_summary_id, student_id,
             course_offering_id, term_id, as_of_date, classes_held, classes_attended, raw_pct,
             adjusted_pct, band, risk_level, computed_by_agent)
           VALUES (%s, %s, NULL, %s, '2025-11-01', 100, %s, %s, %s, %s, %s, 'A11_ATTENDANCE_ANALYSIS')
           ON CONFLICT DO NOTHING""", rows)


def facts_for(s):
    """The same fact shape the engine reads from v_student_profile."""
    return {"social_category": s["category"], "gender": s["gender"], "annual_income": s["income"],
            "cgpa": s["cgpa"], "attendance_pct": s["attendance"], "backlog_count": s["backlogs"],
            "year_of_study": s["yos"], "programme_code": "BTCSE"}


def seed_applications(cur, rng, students, schemes):
    apps, live_by_student = [], {}
    counter = {code: 0 for code in CORE_SCHEMES}
    for s in students:
        for sc in schemes:
            chance, prefix = CORE_SCHEMES[sc["code"]]
            if not engine.evaluate(facts_for(s), sc["eligibility_criteria"])["is_eligible"]:
                continue
            if rng.random() >= chance:
                continue
            status = weighted(rng, STATUS_WEIGHTS)
            counter[sc["code"]] += 1
            opens = date.fromisoformat(sc["application_opens"]) if sc["application_opens"] else date(2025, 8, 1)
            applied = opens + timedelta(days=rng.randint(3, 60))
            amount = sc["benefit_amount"]
            sanctioned = amount if status in ("SANCTIONED", "DISBURSED") else None
            disbursed = amount if status == "DISBURSED" else None
            disbursed_on = applied + timedelta(days=rng.randint(40, 110)) if disbursed else None
            reason = rng.choice(REJECTION_REASONS) if status == "REJECTED" else None
            apps.append((uid("application", f"{s['roll']}:{sc['code']}"), sc["scholarship_scheme_id"],
                         s["student_id"], YEAR, f"{prefix}2025B{counter[sc['code']]:04d}", applied,
                         status, reason, sanctioned, disbursed, disbursed_on))
            if sanctioned:
                live_by_student.setdefault(s["student_id"], []).append(amount)
    cur.executemany(
        """INSERT INTO finance.scholarship_application (scholarship_application_id,
             scholarship_scheme_id, student_id, academic_year_id, external_application_no,
             applied_on, status, rejection_reason, sanctioned_amount, disbursed_amount, disbursed_on)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""", apps)
    return apps, live_by_student


def seed_fees(cur, rng, students, live_by_student):
    demands, reminders = [], []
    single_award = [s for s in students if len(live_by_student.get(s["student_id"], [])) == 1]
    chased = {s["student_id"] for s in rng.sample(single_award, min(14, len(single_award)))}
    for s in students:
        sid = s["student_id"]
        expected = min(TUITION, sum(live_by_student.get(sid, [])))
        if expected:
            paid = TUITION - expected          # the family paid their share; the rest awaits the scheme
        elif rng.random() < 0.78:
            paid = TUITION
        else:
            paid = TUITION - rng.choice([20_000, 35_000, 50_000, 72_500])
        status = "SETTLED" if paid >= TUITION else ("PARTIAL" if paid else "OPEN")
        fd = uid("fee_demand", s["roll"])
        demands.append((fd, sid, YEAR, TUITION, expected, TUITION, paid, status))
        if sid in chased:
            reminders.append((uid("reminder", s["roll"]), sid, fd, "AWAITING_SCHOLARSHIP", 2, "SMS",
                              f"FEE-REM-{s['roll']}"))
        elif not expected and paid < TUITION and rng.random() < 0.5:
            reminders.append((uid("reminder", s["roll"]), sid, fd,
                              rng.choice(["FORGOTTEN", "PERSISTENT"]), rng.randint(1, 3), "SMS",
                              f"FEE-REM-{s['roll']}"))
    cur.executemany(
        """INSERT INTO finance.fee_demand (fee_demand_id, student_id, academic_year_id, gross_amount,
             scholarship_expected, net_payable, paid_amount, due_date, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s, '2025-10-15', %s) ON CONFLICT DO NOTHING""", demands)
    cur.executemany(
        """INSERT INTO finance.reminder_dispatch (reminder_dispatch_id, student_id, fee_demand_id,
             segment, escalation_level, channel, message_ref, suppressed, sent_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, false, '2025-10-20 09:00+05:30')
           ON CONFLICT DO NOTHING""", reminders)
    return len(demands), len(reminders), len(chased)


def seed_accounts(cur):
    """A sign-in for every student in the cohort (the hand-written 20 included)."""
    cur.execute(CREDENTIAL_DDL)
    cur.execute("""
        INSERT INTO identity.app_user (user_id, person_id, username, email, auth_provider)
        SELECT md5('a42-user-' || s.roll_no)::uuid, s.person_id, s.roll_no,
               lower(s.roll_no) || '@vignan.edu', 'LOCAL'
        FROM people.student s
        WHERE s.roll_no ~ '^[0-9]{2}CSE[0-9]{3}$'
        ON CONFLICT DO NOTHING""")
    cur.execute("""
        INSERT INTO identity.user_role (user_id, role_id, scope_type)
        SELECT u.user_id, %s, 'SELF'
        FROM identity.app_user u
        JOIN people.student s ON s.person_id = u.person_id
        WHERE s.roll_no ~ '^[0-9]{2}CSE[0-9]{3}$'
          AND NOT EXISTS (SELECT 1 FROM identity.user_role r
                          WHERE r.user_id = u.user_id AND r.role_id = %s)""",
                (STUDENT_ROLE, STUDENT_ROLE))
    # bcrypt cost 8: ~1000 hashes in well under a minute, still a real bcrypt hash.
    # ON CONFLICT keeps any password a student has already changed.
    cur.execute("""
        INSERT INTO identity.agent42_credential (user_id, password_hash, is_default)
        SELECT u.user_id, crypt(upper(u.username), gen_salt('bf', 8)), true
        FROM identity.app_user u
        JOIN people.student s ON s.person_id = u.person_id
        WHERE s.roll_no ~ '^[0-9]{2}CSE[0-9]{3}$'
          AND NOT EXISTS (SELECT 1 FROM identity.agent42_credential c WHERE c.user_id = u.user_id)
        ON CONFLICT (user_id) DO NOTHING""")
    return cur.rowcount


def main():
    rng = random.Random(4242)
    students = build_students(rng)
    with get_conn() as conn, conn.cursor() as cur:
        schemes = [s for s in engine.get_schemes(conn, active_only=False) if s["code"] in CORE_SCHEMES]
        missing = set(CORE_SCHEMES) - {s["code"] for s in schemes}
        if missing:
            sys.exit(f"Run seed.sql first — missing schemes: {', '.join(sorted(missing))}")
        schemes.sort(key=lambda s: s["code"])
        seed_structure(cur)
        seed_people(cur, students)
        apps, live = seed_applications(cur, rng, students, schemes)
        demands, reminders, chased = seed_fees(cur, rng, students, live)
        new_creds = seed_accounts(cur)
        cur.execute("SELECT count(*) AS n FROM people.student WHERE roll_no ~ '^[0-9]{2}CSE[0-9]{3}$'")
        total = cur.fetchone()["n"]
    print(f"cohort: {total} students ({len(students)} generated + the hand-written 20)")
    print(f"applications generated: {len(apps)}; fee demands: {demands}; reminders: {reminders} "
          f"({chased} chasing fees a scholarship covers)")
    print(f"new sign-ins this run: {new_creds}  (username = register number, password = register number)")


if __name__ == "__main__":
    main()
