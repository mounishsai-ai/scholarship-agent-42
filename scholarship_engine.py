"""
Scholarship Agent (Agent 42) - deterministic reasoning engine.

Every number in this file is computed from the database, never guessed. The
LLM chat layer (app.py) only phrases what these functions return. Each public
action opens an agentops.agent_run, records which records it read, writes an
agentops.agent_output carrying a plain-English reasoning_summary, and - for
renewals - raises an agentops.risk_flag. That run/output/flag trail is what
makes this an agent rather than a set of CRUD screens.
"""
from __future__ import annotations
from decimal import Decimal
from psycopg.types.json import Jsonb
from db import get_conn, AGENT_USER_ID

AGENT_ID = "a4200000-0000-0000-0000-0000000000a4"   # A42_SCHOLARSHIP (see seed.sql)
# human_review.reviewer_user_id is mandatory: the signed-in reviewer's account is
# not wired to identity yet, so decisions are recorded against the seeded
# Scholarship Officer account unless AGENT_USER_ID names another.
REVIEWER_USER_ID = AGENT_USER_ID or "a4200000-0000-0000-0000-0000000000ff"
AGENT_VERSION = "1.0"
ACADEMIC_YEAR_ID = "a4200000-0000-0000-0000-000000000020"

# --------------------------------------------------------------------------
# Rule operators. eligibility_criteria / renewal_criteria are stored as JSON:
#   {"all": [ {"field": "...", "op": "...", "value": ...}, ... ]}
# "all" = every rule must pass; "any" = at least one.
# --------------------------------------------------------------------------
OPS = {
    "eq":     lambda a, e: a is not None and a == e,
    "ne":     lambda a, e: a != e,
    "in":     lambda a, e: a in e,
    "not_in": lambda a, e: a not in e,
    "lte":    lambda a, e: a is not None and _num(a) <= _num(e),
    "gte":    lambda a, e: a is not None and _num(a) >= _num(e),
    "lt":     lambda a, e: a is not None and _num(a) < _num(e),
    "gt":     lambda a, e: a is not None and _num(a) > _num(e),
}
OP_LABEL = {
    "eq": "=", "ne": "≠", "in": "one of", "not_in": "not one of",
    "lte": "≤", "gte": "≥", "lt": "<", "gt": ">",
}
FIELD_LABEL = {
    "social_category": "Social category",
    "annual_income": "Annual family income",
    "cgpa": "CGPA",
    "attendance_pct": "Attendance",
    "gender": "Gender",
    "year_of_study": "Year of study",
    "programme_code": "Programme",
    "backlog_count": "Backlogs",
}


def _num(x):
    return float(x) if isinstance(x, Decimal) else x


def _jsonable(v):
    if isinstance(v, Decimal):
        return float(v)
    return v


# --------------------------------------------------------------------------
# Facts about one student, assembled from the shared read layer.
# --------------------------------------------------------------------------
STUDENT_FACTS_SQL = """
SELECT
    p.student_id,
    p.roll_no,
    p.full_name,
    p.programme_code,
    p.department_code,
    p.current_year_of_study        AS year_of_study,
    p.batch_label,
    p.cgpa,
    p.backlog_count,
    p.attendance_pct,
    p.fee_outstanding,
    per.social_category,
    per.gender,
    (SELECT min(g.annual_income) FROM people.guardian g
      WHERE g.student_id = p.student_id AND g.annual_income IS NOT NULL) AS annual_income
FROM people.v_student_profile p
JOIN people.student s ON s.student_id = p.student_id
JOIN people.person per ON per.person_id = s.person_id
"""


def _facts_row_to_dict(row: dict) -> dict:
    return {
        "student_id": str(row["student_id"]),
        "roll_no": row["roll_no"],
        "full_name": row["full_name"],
        "programme_code": row["programme_code"],
        "department_code": row["department_code"],
        "year_of_study": row["year_of_study"],
        "batch_label": row["batch_label"],
        "cgpa": _jsonable(row["cgpa"]),
        "backlog_count": row["backlog_count"],
        "attendance_pct": _jsonable(row["attendance_pct"]),
        "fee_outstanding": _jsonable(row["fee_outstanding"]),
        "social_category": row["social_category"],
        "gender": row["gender"],
        "annual_income": _jsonable(row["annual_income"]),
    }


# The CSE cohort this agent serves: every batch, register numbers like 23CSE001.
COHORT_SQL = "p.roll_no ~ '^[0-9]{2}CSE[0-9]{3}$'"


def get_students(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(STUDENT_FACTS_SQL + " WHERE " + COHORT_SQL + " ORDER BY p.roll_no")
        return [_facts_row_to_dict(r) for r in cur.fetchall()]


def get_student_by_roll(conn, roll_no: str) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(STUDENT_FACTS_SQL + " WHERE p.roll_no = %s", ((roll_no or "").upper(),))
        row = cur.fetchone()
    return _facts_row_to_dict(row) if row else None


def get_facts(conn, student_id: str) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(STUDENT_FACTS_SQL + " WHERE p.student_id = %s", (student_id,))
        row = cur.fetchone()
    return _facts_row_to_dict(row) if row else None


def get_schemes(conn, active_only: bool = True) -> list[dict]:
    sql = """
        SELECT scholarship_scheme_id, code, name, provider_type, provider_name,
               benefit_type, benefit_amount, eligibility_criteria, required_documents,
               application_opens, application_closes, renewal_required, renewal_criteria,
               is_active
        FROM finance.scholarship_scheme
        {where}
        ORDER BY provider_type, name
    """.format(where="WHERE is_active = true" if active_only else "")
    with conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    for r in rows:
        r["scholarship_scheme_id"] = str(r["scholarship_scheme_id"])
        r["benefit_amount"] = _jsonable(r["benefit_amount"])
        for d in ("application_opens", "application_closes"):
            r[d] = r[d].isoformat() if r[d] else None
    return rows


# --------------------------------------------------------------------------
# The evaluator - the heart of the agent. Walks each rule, records the working.
# --------------------------------------------------------------------------
def evaluate(facts: dict, criteria: dict | None) -> dict:
    if not criteria:
        return {"is_eligible": True, "mode": "all", "criteria_result": [], "unmet": []}
    mode = "any" if "any" in criteria else "all"
    rules = criteria.get(mode, [])
    results = []
    for rule in rules:
        field = rule["field"]
        op = rule["op"]
        expected = rule["value"]
        actual = facts.get(field)
        try:
            passed = bool(OPS[op](actual, expected))
        except Exception:
            passed = False
        results.append({
            "field": field,
            "field_label": FIELD_LABEL.get(field, field),
            "op": op,
            "op_label": OP_LABEL.get(op, op),
            "expected": expected,
            "actual": _jsonable(actual),
            "passed": passed,
        })
    passes = [r["passed"] for r in results]
    is_eligible = (any(passes) if mode == "any" else all(passes)) if results else True
    unmet = [r for r in results if not r["passed"]]
    return {"is_eligible": is_eligible, "mode": mode, "criteria_result": results, "unmet": unmet}


def _reason_line(facts: dict, scheme: dict, verdict: dict) -> str:
    if verdict["is_eligible"]:
        return (f"{facts['full_name']} ({facts['roll_no']}) is ELIGIBLE for "
                f"{scheme['name']}: every rule passed.")
    reasons = []
    for r in verdict["unmet"]:
        reasons.append(f"{r['field_label']} is {r['actual']}, needs {r['op_label']} {r['expected']}")
    return (f"{facts['full_name']} ({facts['roll_no']}) is NOT eligible for "
            f"{scheme['name']}: " + "; ".join(reasons) + ".")


# --------------------------------------------------------------------------
# agentops logging helpers (the audit / evidence trail).
# --------------------------------------------------------------------------
def start_run(conn, trigger_type: str, scope: dict, request_text: str) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO agentops.agent_run
                 (agent_id, agent_version, trigger_type, invoked_by_user_id, scope, request_text, status)
               VALUES (%s, %s, %s, %s, %s, %s, 'RUNNING')
               RETURNING agent_run_id""",
            (AGENT_ID, AGENT_VERSION, trigger_type,
             AGENT_USER_ID or None, Jsonb(scope), request_text),
        )
        return str(cur.fetchone()["agent_run_id"])


def record_input(conn, run_id, schema, table, count, filt=None):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO agentops.agent_run_input
                 (agent_run_id, source_schema, source_table, record_count, filter_expression)
               VALUES (%s, %s, %s, %s, %s)""",
            (run_id, schema, table, count, filt),
        )


def write_output(conn, run_id, output_type, payload, reasoning, *,
                 subject_type=None, subject_id=None, confidence=0.99,
                 requires_approval=False):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO agentops.agent_output
                 (agent_run_id, output_type, subject_type, subject_id, payload,
                  reasoning_summary, confidence, requires_approval, approval_status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING agent_output_id""",
            (run_id, output_type, subject_type, subject_id, Jsonb(payload),
             reasoning, confidence, requires_approval,
             "PENDING" if requires_approval else "NOT_REQUIRED"),
        )
        return str(cur.fetchone()["agent_output_id"])


def finish_run(conn, run_id, status="SUCCEEDED"):
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE agentops.agent_run
               SET status = %s, finished_at = now(),
                   latency_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - started_at)) * 1000)::int
               WHERE agent_run_id = %s""",
            (status, run_id),
        )


# --------------------------------------------------------------------------
# Public actions
# --------------------------------------------------------------------------
def match_student(student_id: str) -> dict:
    """Match one student against every active scheme. Persists eligibility rows."""
    with get_conn() as conn:
        facts = get_facts(conn, student_id)
        if not facts:
            return {"error": "student not found"}
        schemes = get_schemes(conn)
        run_id = start_run(conn, "USER", {"student_id": student_id},
                           f"Match {facts['roll_no']} against all schemes")
        record_input(conn, run_id, "finance", "scholarship_scheme", len(schemes))
        record_input(conn, run_id, "people", "v_student_profile", 1)

        matches = []
        for scheme in schemes:
            verdict = evaluate(facts, scheme["eligibility_criteria"])
            reason = _reason_line(facts, scheme, verdict)
            _persist_eligibility(conn, scheme["scholarship_scheme_id"], student_id, verdict)
            matches.append({
                "scheme": scheme,
                "is_eligible": verdict["is_eligible"],
                "criteria_result": verdict["criteria_result"],
                "reason": reason,
            })
        eligible = [m for m in matches if m["is_eligible"]]
        write_output(
            conn, run_id, "CLASSIFICATION",
            {"student": facts, "eligible_scheme_codes": [m["scheme"]["code"] for m in eligible]},
            f"{facts['full_name']} is eligible for {len(eligible)} of {len(schemes)} schemes.",
            subject_type="STUDENT", subject_id=student_id,
        )
        finish_run(conn, run_id)
        return {"facts": facts, "matches": matches,
                "eligible_count": len(eligible), "run_id": run_id}


def _persist_eligibility(conn, scheme_id, student_id, verdict):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO finance.scholarship_eligibility
                 (scholarship_scheme_id, student_id, is_eligible, criteria_result)
               VALUES (%s, %s, %s, %s)""",
            (scheme_id, student_id, verdict["is_eligible"],
             Jsonb(verdict["criteria_result"])),
        )


PIPELINE_STATUSES = ("SUBMITTED", "INSTITUTION_VERIFIED")
COVERED_STATUSES = ("SANCTIONED", "DISBURSED")


def _application_index(conn) -> dict:
    """(student_id, scheme_id) -> application status, in one query."""
    with conn.cursor() as cur:
        cur.execute("""SELECT student_id, scholarship_scheme_id, status
                       FROM finance.scholarship_application
                       WHERE academic_year_id = %s""", (ACADEMIC_YEAR_ID,))
        return {(str(r["student_id"]), str(r["scholarship_scheme_id"])): r["status"]
                for r in cur.fetchall()}


def cell_state(is_eligible: bool, app_status: str | None) -> str:
    """Where one student x scheme pair stands: the eligibility → claim ladder."""
    if app_status in COVERED_STATUSES:
        return "CLAIMED"
    if app_status in PIPELINE_STATUSES:
        return "APPLIED"
    if app_status == "REJECTED":
        return "REJECTED"
    return "ELIGIBLE" if is_eligible else "NOT_ELIGIBLE"


def _slim_rules(criteria_result: list[dict]) -> list[dict]:
    # Only what the rule trace shows; keeps the 1000-student matrix payload small.
    return [{"field_label": r["field_label"], "op_label": r["op_label"],
             "expected": r["expected"], "actual": r["actual"], "passed": r["passed"]}
            for r in criteria_result]


def match_matrix(only_roll: str | None = None) -> dict:
    """The full students x schemes eligibility matrix. Each cell carries the rule
    trace and where the pair stands: not eligible / eligible / applied / claimed."""
    with get_conn() as conn:
        if only_roll:
            one = get_student_by_roll(conn, only_roll)
            students = [one] if one else []
        else:
            students = get_students(conn)
        schemes = get_schemes(conn)
        apps = _application_index(conn)
        run_id = start_run(conn, "USER",
                           {"scope": "one_student" if only_roll else "all_students"},
                           f"Build eligibility matrix for {only_roll}" if only_roll
                           else "Build eligibility matrix for all students")
        record_input(conn, run_id, "people", "v_student_profile", len(students))
        record_input(conn, run_id, "finance", "scholarship_scheme", len(schemes))
        record_input(conn, run_id, "finance", "scholarship_application", len(apps))
        rows = []
        eligible_cells = 0
        state_counts: dict[str, int] = {}
        for facts in students:
            cells = []
            for scheme in schemes:
                verdict = evaluate(facts, scheme["eligibility_criteria"])
                if verdict["is_eligible"]:
                    eligible_cells += 1
                status = apps.get((facts["student_id"], scheme["scholarship_scheme_id"]))
                state = cell_state(verdict["is_eligible"], status)
                state_counts[state] = state_counts.get(state, 0) + 1
                cells.append({
                    "scheme_code": scheme["code"],
                    "is_eligible": verdict["is_eligible"],
                    "state": state,
                    "app_status": status,
                    "criteria_result": _slim_rules(verdict["criteria_result"]),
                })
            rows.append({"student": facts, "cells": cells})
        write_output(conn, run_id, "REPORT",
                     {"students": len(students), "schemes": len(schemes),
                      "eligible_cells": eligible_cells, "states": state_counts},
                     f"Evaluated {len(students)} students against {len(schemes)} schemes "
                     f"({eligible_cells} eligible matches).")
        finish_run(conn, run_id)
        return {"schemes": schemes, "rows": rows, "run_id": run_id,
                "student_count": len(students), "eligible_cells": eligible_cells,
                "states": state_counts}


def renewal_risk() -> dict:
    """Check every live scholarship against its renewal rules; raise risk flags.

    Batched for a 1000-student cohort: one query for the awards, one for every
    student's facts, then bulk writes. Risk rows are recorded once per award per
    day and a flag is raised only if that award has no open flag yet, so a page
    refresh never multiplies the audit trail."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT app.scholarship_application_id, app.student_id, app.status,
                          app.sanctioned_amount,
                          sc.name AS scheme_name, sc.code AS scheme_code,
                          sc.renewal_criteria
                   FROM finance.scholarship_application app
                   JOIN finance.scholarship_scheme sc
                     ON sc.scholarship_scheme_id = app.scholarship_scheme_id
                   WHERE app.status IN ('SANCTIONED','DISBURSED')
                     AND sc.renewal_required = true""")
            live = cur.fetchall()
        facts_by_id = {s["student_id"]: s for s in get_students(conn)}

        run_id = start_run(conn, "SCHEDULED", {"scope": "live_scholarships"},
                           "Assess renewal risk for all live scholarships")
        record_input(conn, run_id, "finance", "scholarship_application", len(live))
        record_input(conn, run_id, "people", "v_student_profile", len(facts_by_id))
        results, risk_rows, flag_rows = [], [], []
        for app in live:
            facts = facts_by_id.get(str(app["student_id"]))
            if not facts:
                facts = get_facts(conn, str(app["student_id"]))
                if not facts:
                    continue
            verdict = evaluate(facts, app["renewal_criteria"])
            level = _risk_level(verdict)
            risk_rows.append(_renewal_risk_params(app["scholarship_application_id"],
                                                  facts, verdict, level))
            flagged = level in ("AT_RISK", "LIKELY_LOSS")
            if flagged:
                flag_rows.append(_scholarship_flag_params(run_id, facts, app, verdict, level))
            reason = (f"{facts['full_name']} ({facts['roll_no']}) - {app['scheme_name']}: "
                      f"renewal risk {level}. " +
                      ("; ".join(f"{r['field_label']} {r['actual']} needs "
                                 f"{r['op_label']} {r['expected']}" for r in verdict["unmet"])
                       if verdict["unmet"] else "all renewal conditions met."))
            results.append({
                "application_id": str(app["scholarship_application_id"]),
                "student": facts, "scheme_name": app["scheme_name"],
                "scheme_code": app["scheme_code"], "risk_level": level,
                "sanctioned_amount": _jsonable(app["sanctioned_amount"]),
                "criteria_result": verdict["criteria_result"],
                "reason": reason, "flag_raised": flagged,
            })
        _persist_renewal_risks(conn, risk_rows)
        _raise_scholarship_flags(conn, flag_rows)
        # Most urgent first, so a long list still opens on the awards that need a human.
        order = {"LIKELY_LOSS": 0, "AT_RISK": 1, "WATCH": 2, "NONE": 3}
        results.sort(key=lambda r: (order.get(r["risk_level"], 9),
                                    r["student"].get("attendance_pct") or 0))
        at_risk = [r for r in results if r["risk_level"] in ("AT_RISK", "LIKELY_LOSS")]
        write_output(conn, run_id, "ALERT",
                     {"assessed": len(results), "at_risk": len(at_risk)},
                     f"{len(at_risk)} of {len(results)} live scholarships are at risk of "
                     f"non-renewal and were flagged for the Scholarship Officer.",
                     requires_approval=False)
        finish_run(conn, run_id)
        return {"results": results, "at_risk_count": len(at_risk), "run_id": run_id}


def _risk_level(verdict: dict) -> str:
    if verdict["is_eligible"]:
        return "NONE"
    worst_gap = 0.0
    for r in verdict["unmet"]:
        try:
            gap = float(r["expected"]) - float(r["actual"])
            worst_gap = max(worst_gap, gap)
        except (TypeError, ValueError):
            worst_gap = max(worst_gap, 1.0)
    if worst_gap > 10:
        return "LIKELY_LOSS"
    return "AT_RISK"


def _renewal_risk_params(application_id, facts, verdict, level):
    return (application_id, facts.get("attendance_pct"), facts.get("cgpa"),
            Jsonb(verdict["unmet"]), level, level, application_id)


def _persist_renewal_risks(conn, rows):
    """One assessment row per award per day (a re-check the same day is a no-op)."""
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO finance.scholarship_renewal_risk
                 (scholarship_application_id, assessed_on, attendance_pct, cgpa,
                  criteria_at_risk, risk_level, alerted_at)
               SELECT %s::uuid, current_date, %s::numeric, %s::numeric, %s, %s::text,
                      CASE WHEN %s::text IN ('AT_RISK','LIKELY_LOSS') THEN now() ELSE NULL END
               WHERE NOT EXISTS (
                 SELECT 1 FROM finance.scholarship_renewal_risk r
                 WHERE r.scholarship_application_id = %s::uuid AND r.assessed_on = current_date)""",
            rows,
        )


def _scholarship_flag_params(run_id, facts, app, verdict, level):
    signals = {"attendance_pct": facts.get("attendance_pct"),
               "cgpa": facts.get("cgpa"),
               "unmet_rules": verdict["unmet"],
               "scheme": app["scheme_code"]}
    first_unmet = verdict["unmet"][0] if verdict["unmet"] else None
    action = "Contact student and mentor this week to recover the renewal condition."
    if first_unmet and first_unmet["field"] == "attendance_pct":
        action = (f"Attendance is {first_unmet['actual']}%; needs "
                  f"{first_unmet['expected']}%. Arrange condonation / extra classes now.")
    severity = "CRITICAL" if level == "LIKELY_LOSS" else "HIGH"
    summary = f"{app['scheme_name']} renewal at {level} for {facts['roll_no']}"
    return (AGENT_ID, run_id, facts["student_id"], severity, facts.get("attendance_pct"),
            summary, Jsonb(signals), action, AGENT_USER_ID or None,
            facts["student_id"], summary)


def _raise_scholarship_flags(conn, rows):
    """Raise a SCHOLARSHIP_RISK flag unless the same concern is already open."""
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO agentops.risk_flag
                 (agent_id, agent_run_id, subject_type, student_id, flag_type, severity,
                  observed_value, deviation_summary, contributing_signals,
                  suggested_first_action, responder_user_id, respond_by)
               SELECT %s::uuid, %s::uuid, 'STUDENT', %s::uuid, 'SCHOLARSHIP_RISK', %s::text,
                      %s::numeric, %s::text, %s, %s::text, %s::uuid, now() + interval '5 days'
               WHERE NOT EXISTS (
                 SELECT 1 FROM agentops.risk_flag f
                 WHERE f.student_id = %s::uuid AND f.flag_type = 'SCHOLARSHIP_RISK'
                   AND f.status = 'OPEN' AND f.deviation_summary = %s::text)""",
            rows,
        )


def reconcile() -> dict:
    """Match disbursements to the fee ledger; flag reminders that must be suppressed."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT app.student_id, per.full_name, st.roll_no,
                          app.status AS app_status, app.sanctioned_amount, app.disbursed_amount,
                          sc.name AS scheme_name,
                          fd.fee_demand_id, fd.gross_amount, fd.net_payable, fd.paid_amount, fd.outstanding,
                          fd.scholarship_expected,
                          rd.reminder_dispatch_id, rd.segment, rd.suppressed, rd.escalation_level
                   FROM finance.scholarship_application app
                   JOIN finance.scholarship_scheme sc ON sc.scholarship_scheme_id = app.scholarship_scheme_id
                   JOIN people.student st ON st.student_id = app.student_id
                   JOIN people.person per ON per.person_id = st.person_id
                   LEFT JOIN finance.fee_demand fd ON fd.student_id = app.student_id
                   LEFT JOIN finance.reminder_dispatch rd
                          ON rd.fee_demand_id = fd.fee_demand_id AND rd.suppressed = false
                   WHERE app.status IN ('SANCTIONED','DISBURSED')""")
            rows = cur.fetchall()

        run_id = start_run(conn, "SCHEDULED", {"scope": "disbursement_reconciliation"},
                           "Reconcile scholarship disbursements against fee ledger")
        record_input(conn, run_id, "finance", "scholarship_application", len(rows))
        # What the fee ledger (Agent 40) should expect from scholarships, per student.
        award_total: dict[str, float] = {}
        seen_award = set()
        for r in rows:
            key = (str(r["student_id"]), r["scheme_name"])
            if key in seen_award:
                continue
            seen_award.add(key)
            award_total[str(r["student_id"])] = award_total.get(str(r["student_id"]), 0) + \
                _jsonable(r["sanctioned_amount"] or r["disbursed_amount"] or 0)
        results = []
        suppress_count = 0
        ledger_students = set()
        for r in rows:
            covered = _jsonable(r["disbursed_amount"] or r["sanctioned_amount"] or 0)
            outstanding = _jsonable(r["outstanding"] or 0)
            recommend_suppress = bool(r["reminder_dispatch_id"]) and covered >= outstanding > 0
            recommendation = None
            if recommend_suppress:
                suppress_count += 1
                recommendation = (
                    f"Suppress the fee reminder to {r['full_name']} ({r['roll_no']}): "
                    f"{r['scheme_name']} covers Rs {covered:,.0f} against an outstanding of "
                    f"Rs {outstanding:,.0f}. Per the fee-reminder rule, reminders MUST be "
                    f"suppressed where a sanctioned scholarship covers the dues.")
            expected_now = _jsonable(r["scholarship_expected"])
            # the ledger can never expect more than the fee itself
            should_expect = min(award_total.get(str(r["student_id"]), 0),
                                _jsonable(r["gross_amount"]) if r["gross_amount"] is not None else float("inf"))
            ledger_mismatch = bool(r["fee_demand_id"]) and float(expected_now or 0) != float(should_expect)
            if ledger_mismatch:
                ledger_students.add(str(r["student_id"]))
            results.append({
                "student_id": str(r["student_id"]), "roll_no": r["roll_no"],
                "full_name": r["full_name"], "scheme_name": r["scheme_name"],
                "ledger_expected": should_expect, "ledger_mismatch": ledger_mismatch,
                "app_status": r["app_status"], "covered_amount": covered,
                "outstanding": outstanding,
                "scholarship_expected": _jsonable(r["scholarship_expected"]),
                "active_reminder": bool(r["reminder_dispatch_id"]),
                "reminder_dispatch_id": str(r["reminder_dispatch_id"]) if r["reminder_dispatch_id"] else None,
                "reminder_segment": r["segment"],
                "recommend_suppress": recommend_suppress,
                "recommendation": recommendation,
            })
        # Anything needing a human first; the rest are reconciled and quiet.
        results.sort(key=lambda r: (not r["recommend_suppress"], not r["ledger_mismatch"],
                                    not r["active_reminder"], r["roll_no"]))
        summary = (f"Reconciled {len(results)} live scholarships; recommended suppressing "
                   f"{suppress_count} fee reminder(s) already covered by a scholarship"
                   + (f" and syncing {len(ledger_students)} fee ledger entr"
                      f"{'y' if len(ledger_students) == 1 else 'ies'}" if ledger_students else "") + ".")
        # One open recommendation is enough: a page refresh must not queue the same
        # request for a human again and again.
        with conn.cursor() as cur:
            # A newer pass supersedes older requests: expire any pending
            # recommendation that no longer matches, and duplicates of the one that does.
            cur.execute("""UPDATE agentops.agent_output o SET approval_status = 'EXPIRED'
                           FROM agentops.agent_run r
                           WHERE r.agent_run_id = o.agent_run_id AND r.agent_id = %s
                             AND o.output_type = 'RECOMMENDATION' AND o.approval_status = 'PENDING'
                             AND (o.reasoning_summary <> %s OR o.agent_output_id <> (
                                  SELECT o2.agent_output_id FROM agentops.agent_output o2
                                  JOIN agentops.agent_run r2 ON r2.agent_run_id = o2.agent_run_id
                                  WHERE r2.agent_id = %s AND o2.output_type = 'RECOMMENDATION'
                                    AND o2.approval_status = 'PENDING' AND o2.reasoning_summary = %s
                                  ORDER BY o2.created_at DESC LIMIT 1))""",
                        (AGENT_ID, summary, AGENT_ID, summary))
            cur.execute("""SELECT 1 FROM agentops.agent_output o
                           JOIN agentops.agent_run r ON r.agent_run_id = o.agent_run_id
                           WHERE r.agent_id = %s AND o.output_type = 'RECOMMENDATION'
                             AND o.approval_status = 'PENDING' AND o.reasoning_summary = %s
                           LIMIT 1""", (AGENT_ID, summary))
            already_open = cur.fetchone() is not None
        write_output(conn, run_id, "RECOMMENDATION",
                     {"reconciled": len(results), "reminders_to_suppress": suppress_count,
                      "ledger_to_sync": len(ledger_students)},
                     summary,
                     requires_approval=(suppress_count > 0 or bool(ledger_students)) and not already_open)
        finish_run(conn, run_id)
        return {"results": results, "suppress_count": suppress_count,
                "ledger_sync_count": len(ledger_students), "run_id": run_id}


def sync_fee_ledger(reviewer_note: str = "") -> dict:
    """Officer-approved action (feeds Agent 40): set each open fee demand's
    scholarship_expected to the live awards actually sanctioned for that student,
    so the ledger — and every reminder built on it — agrees with the scholarships."""
    with get_conn() as conn:
        run_id = start_run(conn, "USER", {"scope": "fee_ledger_sync"},
                           "Sync scholarship_expected on the fee ledger after officer approval")
        with conn.cursor() as cur:
            cur.execute(
                """WITH awards AS (
                       SELECT a.student_id, a.academic_year_id,
                              sum(coalesce(a.sanctioned_amount, a.disbursed_amount, 0)) AS total
                       FROM finance.scholarship_application a
                       WHERE a.status IN ('SANCTIONED','DISBURSED')
                       GROUP BY a.student_id, a.academic_year_id)
                   UPDATE finance.fee_demand fd
                   SET scholarship_expected = least(aw.total, fd.gross_amount)
                   FROM awards aw
                   WHERE aw.student_id = fd.student_id AND aw.academic_year_id = fd.academic_year_id
                     AND fd.scholarship_expected <> least(aw.total, fd.gross_amount)
                   RETURNING fd.student_id""")
            changed = len(cur.fetchall())
        record_input(conn, run_id, "finance", "fee_demand", changed)
        write_output(conn, run_id, "ACTION_PROPOSAL", {"fee_demands_updated": changed},
                     f"Fee ledger synced after officer approval: {changed} fee demand(s) now "
                     f"expect the scholarship actually sanctioned. " + (reviewer_note or ""))
        finish_run(conn, run_id)
        return {"ok": True, "updated": changed, "run_id": run_id}


def suppress_reminder(reminder_dispatch_id: str, reviewer_note: str = "") -> dict:
    """Human-approved action: actually suppress a fee reminder (the approval gate)."""
    with get_conn() as conn:
        run_id = start_run(conn, "USER", {"reminder_dispatch_id": reminder_dispatch_id},
                           "Suppress fee reminder after officer approval")
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE finance.reminder_dispatch
                   SET suppressed = true,
                       suppression_reason = %s
                   WHERE reminder_dispatch_id = %s
                   RETURNING student_id""",
                (reviewer_note or "Covered by sanctioned scholarship (officer approved)",
                 reminder_dispatch_id),
            )
            row = cur.fetchone()
        write_output(conn, run_id, "ACTION_PROPOSAL",
                     {"reminder_dispatch_id": reminder_dispatch_id, "suppressed": True},
                     "Fee reminder suppressed after Scholarship Officer approval.")
        finish_run(conn, run_id)
        return {"ok": bool(row), "run_id": run_id}


# An application is "stalled" once it has sat at one stage longer than this.
STALL_DAYS = {"SUBMITTED": 30, "INSTITUTION_VERIFIED": 45, "SANCTIONED": 60}


def draft_follow_ups() -> dict:
    """Follow up on stalled cases: draft one follow-up per stalled application
    (never twice), each waiting for officer approval before anything is sent."""
    stalled = [a for a in applications() if a["stalled"] and not a["follow_up_drafted"]]
    next_step = {"SUBMITTED": "the college verification desk",
                 "INSTITUTION_VERIFIED": "the scheme portal / sanctioning authority",
                 "SANCTIONED": "the disbursing bank / treasury (DBT)"}
    with get_conn() as conn:
        run_id = start_run(conn, "SCHEDULED", {"scope": "stalled_applications"},
                           "Draft follow-ups for stalled scholarship applications")
        record_input(conn, run_id, "finance", "scholarship_application", len(stalled))
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO agentops.agent_output
                     (agent_run_id, output_type, subject_type, subject_id, payload,
                      reasoning_summary, confidence, requires_approval, approval_status)
                   VALUES (%s, 'ACTION_PROPOSAL', 'STUDENT', %s, %s, %s, 0.99, true, 'PENDING')""",
                [(run_id, a["scholarship_application_id"],
                  Jsonb({"application": a["external_application_no"], "roll_no": a["roll_no"],
                         "status": a["status"], "days_waiting": a["days_waiting"]}),
                  f"Follow up {a['external_application_no'] or a['scheme_code']} for {a['full_name']} "
                  f"({a['roll_no']}): {a['status'].replace('_', ' ').lower()} for {a['days_waiting']} days — "
                  f"chase {next_step[a['status']]}.")
                 for a in stalled])
        finish_run(conn, run_id)
    return {"drafted": len(stalled), "run_id": run_id}


def applications() -> list[dict]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT app.scholarship_application_id, app.student_id, st.roll_no, per.full_name,
                      st.current_year_of_study AS year_of_study,
                      sc.name AS scheme_name, sc.code AS scheme_code, sc.provider_type,
                      app.status, app.external_application_no, app.applied_on,
                      app.sanctioned_amount, app.disbursed_amount, app.disbursed_on,
                      app.rejection_reason,
                      (current_date - app.applied_on) AS days_waiting,
                      EXISTS (SELECT 1 FROM agentops.agent_output o
                              WHERE o.output_type = 'ACTION_PROPOSAL'
                                AND o.subject_id = app.scholarship_application_id
                                AND o.approval_status IN ('PENDING','APPROVED')) AS follow_up_drafted
               FROM finance.scholarship_application app
               JOIN finance.scholarship_scheme sc ON sc.scholarship_scheme_id = app.scholarship_scheme_id
               JOIN people.student st ON st.student_id = app.student_id
               JOIN people.person per ON per.person_id = st.person_id
               WHERE st.roll_no ~ '^[0-9]{2}CSE[0-9]{3}$'
               ORDER BY app.applied_on DESC NULLS LAST, st.roll_no""")
        rows = cur.fetchall()
    for r in rows:
        r["scholarship_application_id"] = str(r["scholarship_application_id"])
        r["student_id"] = str(r["student_id"])
        waiting = r["days_waiting"]
        r["stalled"] = bool(r["status"] in STALL_DAYS and waiting is not None
                            and waiting > STALL_DAYS[r["status"]])
        r["sanctioned_amount"] = _jsonable(r["sanctioned_amount"])
        r["disbursed_amount"] = _jsonable(r["disbursed_amount"])
        for d in ("applied_on", "disbursed_on"):
            r[d] = r[d].isoformat() if r[d] else None
    return rows


def coverage_report() -> dict:
    """Headline coverage: eligible vs covered per scheme, plus rejection reasons."""
    with get_conn() as conn:
        students = get_students(conn)
        schemes = get_schemes(conn)
        apps = _application_index(conn)
        per_scheme = []
        total_eligible = 0
        total_covered = 0
        total_claimed = 0   # eligible pairs that are sanctioned/disbursed
        # per student: which schemes they qualify for, and how far each got
        ladder = {s["student_id"]: {} for s in students}
        for scheme in schemes:
            sid = scheme["scholarship_scheme_id"]
            eligible = applied = covered = 0
            states = {"CLAIMED": 0, "APPLIED": 0, "REJECTED": 0, "ELIGIBLE": 0}
            for f in students:
                status = apps.get((f["student_id"], sid))
                if status in PIPELINE_STATUSES + COVERED_STATUSES:
                    applied += 1
                if status in COVERED_STATUSES:
                    covered += 1
                if not evaluate(f, scheme["eligibility_criteria"])["is_eligible"]:
                    continue
                eligible += 1
                state = cell_state(True, status)
                states[state] += 1
                ladder[f["student_id"]][sid] = state
            total_eligible += eligible
            total_covered += covered
            total_claimed += states["CLAIMED"]
            per_scheme.append({
                "scheme_code": scheme["code"], "scheme_name": scheme["name"],
                "benefit_amount": scheme["benefit_amount"],
                "eligible": eligible, "applied": applied, "covered": covered,
                # an award to a student who no longer passes the rules can't close
                # someone else's gap, so the gap is eligible pairs not yet claimed (never < 0)
                "gap": eligible - states["CLAIMED"],
                # the eligible pairs only, split by where each one stands (sums to eligible)
                "eligible_claimed": states["CLAIMED"], "eligible_applied": states["APPLIED"],
                "eligible_rejected": states["REJECTED"], "eligible_unapplied": states["ELIGIBLE"],
            })

        # Student-level coverage: how partial is it, person by person?
        buckets = {"FULL": 0, "PARTIAL": 0, "IN_PROGRESS": 0, "UNCLAIMED": 0, "NOT_ELIGIBLE": 0}
        by_batch: dict[str, dict] = {}
        student_state = {}
        for f in students:
            got = set(ladder[f["student_id"]].values())
            if not got:
                b = "NOT_ELIGIBLE"
            elif "CLAIMED" in got:
                b = "PARTIAL" if "ELIGIBLE" in got else "FULL"
            elif "APPLIED" in got:
                b = "IN_PROGRESS"
            else:
                b = "UNCLAIMED"
            buckets[b] += 1
            student_state[f["roll_no"]] = b
            key = f.get("batch_label") or f"Year {f.get('year_of_study')}"
            row = by_batch.setdefault(key, {"batch": key, "year_of_study": f.get("year_of_study"),
                                            "students": 0, **{k: 0 for k in buckets}})
            row["students"] += 1
            row[b] += 1
        with conn.cursor() as cur:
            cur.execute(
                """SELECT rejection_reason, count(*) AS n
                   FROM finance.scholarship_application
                   WHERE status = 'REJECTED' AND rejection_reason IS NOT NULL
                   GROUP BY rejection_reason ORDER BY n DESC""")
            rejections = cur.fetchall()
        with conn.cursor() as cur:
            cur.execute(
                """SELECT count(*) FILTER (WHERE status IN ('SANCTIONED','DISBURSED')) AS awards,
                          coalesce(sum(sanctioned_amount) FILTER (WHERE status IN ('SANCTIONED','DISBURSED')), 0) AS sanctioned,
                          coalesce(sum(disbursed_amount) FILTER (WHERE status = 'DISBURSED'), 0) AS disbursed,
                          count(*) FILTER (WHERE status = 'SANCTIONED') AS awaiting,
                          coalesce(sum(sanctioned_amount) FILTER (WHERE status = 'SANCTIONED'), 0) AS awaiting_amount,
                          round(avg(disbursed_on - applied_on) FILTER (WHERE status = 'DISBURSED')) AS avg_days,
                          count(*) FILTER (WHERE status = 'REJECTED') AS rejected,
                          count(*) AS applications
                   FROM finance.scholarship_application WHERE academic_year_id = %s""",
                (ACADEMIC_YEAR_ID,))
            dsb = {k: _jsonable(v) for k, v in cur.fetchone().items()}
            cur.execute(
                """SELECT sc.code AS scheme_code, count(*) AS n
                   FROM finance.scholarship_application a
                   JOIN finance.scholarship_scheme sc USING (scholarship_scheme_id)
                   WHERE a.status = 'REJECTED' GROUP BY sc.code ORDER BY n DESC""")
            rej_by_scheme = cur.fetchall()
            cur.execute("SELECT label FROM core.academic_year WHERE academic_year_id = %s",
                        (ACADEMIC_YEAR_ID,))
            year = cur.fetchone()
        return {
            "academic_year": year["label"] if year else None,
            "disbursement": dsb,
            "rejections_by_scheme": rej_by_scheme,
            "per_scheme": per_scheme,
            "total_eligible": total_eligible,
            "total_covered": total_covered,
            "total_claimed": total_claimed,
            "coverage_gap": total_eligible - total_claimed,
            "rejections": rejections,
            "students": {"total": len(students), **buckets},
            # roll -> bucket, in roll order: drives the one-square-per-student grid
            "student_states": [[r, student_state[r]] for r in sorted(student_state)],
            "by_batch": sorted(by_batch.values(), key=lambda x: x["batch"]),
        }


def open_flags() -> list[dict]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT f.risk_flag_id, f.severity, f.flag_type, f.deviation_summary,
                      f.suggested_first_action, f.status, f.raised_at,
                      st.roll_no, per.full_name
               FROM agentops.risk_flag f
               LEFT JOIN people.student st ON st.student_id = f.student_id
               LEFT JOIN people.person per ON per.person_id = st.person_id
               WHERE f.flag_type = 'SCHOLARSHIP_RISK' AND f.status = 'OPEN'
               ORDER BY f.raised_at DESC
               LIMIT 200""")
        rows = cur.fetchall()
    for r in rows:
        r["risk_flag_id"] = str(r["risk_flag_id"])
        r["raised_at"] = r["raised_at"].isoformat() if r["raised_at"] else None
    return rows


def pending_approvals(limit: int = 50) -> dict:
    """The newest items waiting on a human, plus how many are waiting in total."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT o.agent_output_id, o.output_type, o.reasoning_summary, o.payload,
                      o.created_at
               FROM agentops.agent_output o
               JOIN agentops.agent_run r ON r.agent_run_id = o.agent_run_id
               WHERE o.approval_status = 'PENDING' AND r.agent_id = %s
               ORDER BY o.created_at DESC
               LIMIT %s""", (AGENT_ID, limit))
        rows = cur.fetchall()
        cur.execute(
            """SELECT count(*) AS n FROM agentops.agent_output o
               JOIN agentops.agent_run r ON r.agent_run_id = o.agent_run_id
               WHERE o.approval_status = 'PENDING' AND r.agent_id = %s""", (AGENT_ID,))
        total = cur.fetchone()["n"]
    for r in rows:
        r["agent_output_id"] = str(r["agent_output_id"])
        r["created_at"] = r["created_at"].isoformat() if r["created_at"] else None
    return {"approvals": rows, "total": total, "by_type": pending_counts()}


def approve_output(agent_output_id: str, decision: str, note: str = "") -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            status = {"APPROVE": "APPROVED", "REJECT": "REJECTED",
                      "MODIFY": "MODIFIED"}.get(decision, "APPROVED")
            cur.execute(
                "UPDATE agentops.agent_output SET approval_status = %s WHERE agent_output_id = %s",
                (status, agent_output_id))
            cur.execute(
                """INSERT INTO agentops.human_review
                     (agent_output_id, reviewer_user_id, decision, reason)
                   VALUES (%s, %s, %s, %s)""",
                (agent_output_id, REVIEWER_USER_ID, decision, note or None))
        return {"ok": True, "status": status}


BULK_APPROVABLE = {"ALERT": "student notices", "ACTION_PROPOSAL": "follow-ups"}


def approve_bulk(output_type: str, note: str = "") -> dict:
    """A human approves every pending item of one kind at once (notices and
    follow-ups only — money-moving recommendations stay one at a time)."""
    if output_type not in BULK_APPROVABLE:
        return {"error": "Only student notices and follow-ups can be approved in bulk."}
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE agentops.agent_output o SET approval_status = 'APPROVED'
               FROM agentops.agent_run r
               WHERE r.agent_run_id = o.agent_run_id AND r.agent_id = %s
                 AND o.output_type = %s AND o.approval_status = 'PENDING'
               RETURNING o.agent_output_id""", (AGENT_ID, output_type))
        ids = [x["agent_output_id"] for x in cur.fetchall()]
        cur.executemany(
            """INSERT INTO agentops.human_review (agent_output_id, reviewer_user_id, decision, reason)
               VALUES (%s, %s, 'APPROVE', %s)""",
            [(i, REVIEWER_USER_ID, note or f"Bulk approval of {BULK_APPROVABLE[output_type]}")
             for i in ids])
    return {"ok": True, "approved": len(ids)}


def pending_counts() -> dict:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT o.output_type, count(*) AS n FROM agentops.agent_output o
               JOIN agentops.agent_run r ON r.agent_run_id = o.agent_run_id
               WHERE r.agent_id = %s AND o.approval_status = 'PENDING'
               GROUP BY o.output_type""", (AGENT_ID,))
        return {x["output_type"]: x["n"] for x in cur.fetchall()}


def recent_runs(limit: int = 15) -> list[dict]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT r.agent_run_id, r.trigger_type, r.request_text, r.status,
                      r.started_at, r.latency_ms,
                      (SELECT count(*) FROM agentops.agent_run_input i
                        WHERE i.agent_run_id = r.agent_run_id) AS input_sources,
                      (SELECT count(*) FROM agentops.agent_output o
                        WHERE o.agent_run_id = r.agent_run_id) AS outputs
               FROM agentops.agent_run r
               WHERE r.agent_id = %s
               ORDER BY r.started_at DESC
               LIMIT %s""",
            (AGENT_ID, limit))
        rows = cur.fetchall()
    for r in rows:
        r["agent_run_id"] = str(r["agent_run_id"])
        r["started_at"] = r["started_at"].isoformat() if r["started_at"] else None
    return rows


def _coerce(op: str, val):
    """Turn a form value into the right JSON type for an eligibility rule."""
    if op in ("in", "not_in"):
        return [v.strip() for v in str(val).split(",") if v.strip()]
    try:
        f = float(val)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return val


def create_scheme(data: dict) -> dict:
    """Officer action: register a new scholarship scheme. Builds the machine-
    evaluable eligibility_criteria from the submitted rule rows and logs the run."""
    code = (data.get("code") or "").strip().upper()
    name = (data.get("name") or "").strip()
    if not code or not name:
        return {"error": "Scheme code and name are required."}

    rules = []
    for r in data.get("rules", []):
        field, op, val = r.get("field"), r.get("op"), r.get("value")
        if not field or not op or val in (None, ""):
            continue
        rules.append({"field": field, "op": op, "value": _coerce(op, val)})
    criteria = {"all": rules}
    docs = [d.strip() for d in (data.get("required_documents") or "").split(",") if d.strip()]
    renewal = bool(data.get("renewal_required"))
    renewal_criteria = ({"all": [{"field": "attendance_pct", "op": "gte", "value": 75}]}
                        if renewal else None)
    amount = data.get("benefit_amount")
    try:
        amount = float(amount) if amount not in (None, "") else None
    except (TypeError, ValueError):
        amount = None

    with get_conn() as conn:
        run_id = start_run(conn, "USER", {"scheme_code": code}, f"Create scheme {code}")
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO finance.scholarship_scheme
                         (code, name, provider_type, provider_name, benefit_type, benefit_amount,
                          eligibility_criteria, required_documents, application_opens,
                          application_closes, renewal_required, renewal_criteria,
                          academic_year_id, is_active)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true)
                       RETURNING scholarship_scheme_id""",
                    (code, name, data.get("provider_type") or None, data.get("provider_name") or None,
                     data.get("benefit_type") or None, amount,
                     Jsonb(criteria), docs or None,
                     data.get("application_opens") or None, data.get("application_closes") or None,
                     renewal, Jsonb(renewal_criteria) if renewal_criteria else None,
                     ACADEMIC_YEAR_ID),
                )
                sid = str(cur.fetchone()["scholarship_scheme_id"])
        except Exception as exc:  # unique code, bad data, etc.
            msg = str(exc)
            if "unique" in msg.lower() or "duplicate" in msg.lower():
                return {"error": f"A scheme with code {code} already exists."}
            return {"error": f"Could not create scheme: {msg}"}
        write_output(conn, run_id, "ACTION_PROPOSAL",
                     {"scheme_id": sid, "code": code, "rules": rules},
                     f"Registered new scholarship scheme {name} ({code}) with {len(rules)} rule(s).")
        finish_run(conn, run_id)
        return {"ok": True, "scheme_id": sid, "code": code, "name": name}


def update_scheme(code: str, data: dict) -> dict:
    """Officer action: revise a scheme for the new cycle (window, amount, documents,
    rules, renewal) or retire / reinstate it. Every student is re-matched on the
    next read, and the change is logged."""
    code = (code or "").strip().upper()
    sets, params = [], []
    if "is_active" in data:
        sets.append("is_active = %s"); params.append(bool(data["is_active"]))
    for f in ("name", "provider_type", "provider_name", "benefit_type"):
        if data.get(f):
            sets.append(f"{f} = %s"); params.append(data[f])
    for f in ("application_opens", "application_closes"):
        if f in data:
            sets.append(f"{f} = %s"); params.append(data[f] or None)
    if "benefit_amount" in data:
        try:
            amt = float(data["benefit_amount"]) if data["benefit_amount"] not in (None, "") else None
        except (TypeError, ValueError):
            return {"error": "Benefit amount must be a number."}
        sets.append("benefit_amount = %s"); params.append(amt)
    if "required_documents" in data:
        docs = [d.strip() for d in (data.get("required_documents") or "").split(",") if d.strip()]
        sets.append("required_documents = %s"); params.append(docs or None)
    if "rules" in data:
        rules = [{"field": r["field"], "op": r["op"], "value": _coerce(r["op"], r["value"])}
                 for r in data.get("rules") or []
                 if r.get("field") and r.get("op") and r.get("value") not in (None, "")]
        sets.append("eligibility_criteria = %s"); params.append(Jsonb({"all": rules}))
    if "renewal_required" in data:
        ren = bool(data["renewal_required"])
        sets.append("renewal_required = %s"); params.append(ren)
        sets.append("renewal_criteria = coalesce(CASE WHEN %s THEN renewal_criteria END, %s)")
        params.extend([ren, Jsonb({"all": [{"field": "attendance_pct", "op": "gte", "value": 75}]})
                       if ren else None])
    if not sets:
        return {"error": "Nothing to update."}
    with get_conn() as conn:
        run_id = start_run(conn, "USER", {"scheme_code": code}, f"Update scheme {code}")
        with conn.cursor() as cur:
            cur.execute(f"UPDATE finance.scholarship_scheme SET {', '.join(sets)} "
                        f"WHERE code = %s RETURNING scholarship_scheme_id, name, is_active",
                        params + [code])
            row = cur.fetchone()
        if not row:
            return {"error": f"No scheme with code {code}."}
        changed = sorted(k for k in data if k != "code")
        write_output(conn, run_id, "ACTION_PROPOSAL",
                     {"scheme_code": code, "changed": changed},
                     f"Scheme {row['name']} ({code}) updated by the Scholarship Officer: "
                     f"{', '.join(changed)}." + ("" if row["is_active"] else " Scheme is retired."))
        finish_run(conn, run_id)
    return {"ok": True, "code": code, "is_active": row["is_active"]}


def _rupees(n):
    return "—" if n in (None, "") else "₹" + format(int(float(n)), ",d")


def application_pack(student_id: str) -> dict:
    """Step 4 — application preparation: for each scheme the student is eligible
    for, the document checklist plus pre-filled institutional data."""
    with get_conn() as conn:
        facts = get_facts(conn, student_id)
        if not facts:
            return {"error": "student not found"}
        schemes = get_schemes(conn)
        prefilled = {
            "Full name": facts["full_name"], "Roll number": facts["roll_no"],
            "Programme / Year": f"{facts['programme_code']} · Year {facts['year_of_study']}",
            "Social category": facts["social_category"] or "—",
            "Annual family income": _rupees(facts["annual_income"]),
            "CGPA": facts["cgpa"], "Attendance": f"{facts['attendance_pct']}%",
        }
        with conn.cursor() as cur:
            cur.execute("""SELECT scholarship_scheme_id, status FROM finance.scholarship_application
                           WHERE student_id = %s""", (student_id,))
            applied = {str(r["scholarship_scheme_id"]): r["status"] for r in cur.fetchall()}
            cur.execute("SELECT current_date AS today")
            today = cur.fetchone()["today"]
        packs = []
        for scheme in schemes:
            if not evaluate(facts, scheme["eligibility_criteria"])["is_eligible"]:
                continue
            packs.append({
                "scheme": scheme["name"], "code": scheme["code"],
                "benefit": _rupees(scheme.get("benefit_amount")),
                "deadline": scheme.get("application_closes") or "as published",
                "documents": scheme.get("required_documents") or [],
                "status": applied.get(scheme["scholarship_scheme_id"]),
                "checks": _pack_checks(facts, scheme, today),
            })
        return {"facts": facts, "prefilled": prefilled, "packs": packs,
                "record_checks": _record_checks(facts)}


def _record_checks(facts: dict) -> list[dict]:
    """Format validation of the institutional data that gets pre-filled into a form."""
    import re as _re
    name = facts.get("full_name") or ""
    inc = facts.get("annual_income")
    return [
        {"label": "Name as on record", "ok": bool(_re.fullmatch(r"[A-Za-z][A-Za-z .'-]{1,79}", name)),
         "note": "letters, spaces, . ' - only (portals reject digits and symbols)"},
        {"label": "Register number format", "ok": bool(_re.fullmatch(r"\d{2}CSE\d{3}", facts.get("roll_no") or "")),
         "note": "YYCSE### as issued by the university"},
        {"label": "Annual family income on file", "ok": inc is not None and float(inc) > 0,
         "note": "needed for every means-tested scheme; certificate must match"},
        {"label": "Social category on file", "ok": bool(facts.get("social_category")),
         "note": "needed for category-based schemes; certificate must match"},
        {"label": "CGPA published", "ok": facts.get("cgpa") is not None, "note": "latest term result"},
        {"label": "Attendance on record", "ok": facts.get("attendance_pct") is not None,
         "note": "renewals check it against 75%"},
    ]


def _pack_checks(facts: dict, scheme: dict, today) -> list[dict]:
    from datetime import date as _date
    checks = []
    opens, closes = scheme.get("application_opens"), scheme.get("application_closes")
    if closes:
        c = _date.fromisoformat(closes)
        o = _date.fromisoformat(opens) if opens else None
        if o and today < o:
            checks.append({"label": "Application window", "ok": True, "note": f"opens {opens}"})
        elif today <= c:
            left = (c - today).days
            checks.append({"label": "Application window", "ok": True,
                           "note": f"open — {left} day(s) left (closes {closes})"})
        else:
            checks.append({"label": "Application window", "ok": False,
                           "note": f"closed on {closes} — prepare now for the next cycle"})
    docs = scheme.get("required_documents") or []
    checks.append({"label": "Document list", "ok": bool(docs),
                   "note": f"{len(docs)} document(s) to collect" if docs else "not published by the scheme"})
    return checks


def integration_report() -> dict:
    """Evidence that the agent runs on the shared platform database and honours
    its declared integrations (consumes Agents 10, 11; feeds Agents 40, 41, 43).
    Every count is queried live, and the provenance rows are real agent_run_input
    records — proof that answers trace back to database records."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT (SELECT count(*) FROM people.student WHERE roll_no ~ '^[0-9]{2}CSE[0-9]{3}$') AS students,
                   (SELECT count(*) FROM finance.scholarship_scheme)      AS schemes,
                   (SELECT count(*) FROM attendance.attendance_summary)   AS attendance_rows,
                   (SELECT count(*) FROM assessment.term_result)          AS term_results,
                   (SELECT count(*) FROM finance.scholarship_application) AS applications,
                   (SELECT count(*) FROM finance.fee_demand)              AS fee_demands,
                   (SELECT count(*) FROM finance.reminder_dispatch)       AS reminders,
                   (SELECT count(*) FROM agentops.agent_run WHERE agent_id = %s) AS runs_logged,
                   (SELECT count(DISTINCT schemaname) FROM pg_tables
                     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) AS schema_count,
                   (SELECT count(*) FROM pg_tables
                     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) AS table_count,
                   now() AS db_time, version() AS db_version""",
                    (AGENT_ID,))
        c = cur.fetchone()
        cur.execute("""
            SELECT ri.source_schema, ri.source_table, ri.record_count,
                   r.request_text, r.started_at
            FROM agentops.agent_run_input ri
            JOIN agentops.agent_run r ON r.agent_run_id = ri.agent_run_id
            ORDER BY ri.agent_run_input_id DESC LIMIT 12""")
        prov = cur.fetchall()
    for p in prov:
        p["started_at"] = p["started_at"].isoformat() if p["started_at"] else None

    # Identify the actual database from the live connection string (honest —
    # shows Google Cloud SQL in production, local Postgres in dev).
    import re as _re
    from db import DATABASE_URL
    url = DATABASE_URL or ""
    if "/cloudsql/" in url:
        provider = "Google Cloud SQL"
        m = _re.search(r"/cloudsql/([^?&\"']+)", url)
        instance = m.group(1) if m else ""
    else:
        provider = "PostgreSQL"
        m = _re.search(r"@([^/?]+)", url)
        instance = m.group(1) if m else "local"
    db_version = (c.get("db_version") or "").split(" on ")[0]
    db_time = c["db_time"].isoformat() if c.get("db_time") else None

    return {
        "database": {
            "provider": provider, "instance": instance, "version": db_version,
            "server_time": db_time, "connected": True,
            "schemas": c.get("schema_count"), "tables": c.get("table_count"),
            "source": "schema_full.sql (the platform schema provided for the event)",
            "reads": [
                {"object": "people.v_student_profile (view)", "rows": c["students"]},
                {"object": "attendance.attendance_summary", "rows": c["attendance_rows"]},
                {"object": "assessment.term_result", "rows": c["term_results"]},
                {"object": "finance.scholarship_scheme", "rows": c["schemes"]},
                {"object": "finance.scholarship_application", "rows": c["applications"]},
                {"object": "finance.fee_demand", "rows": c["fee_demands"]},
                {"object": "finance.reminder_dispatch", "rows": c["reminders"]},
            ],
            "runs_logged": c["runs_logged"],
        },
        "consumes": [
            {"agent": "Agent 10 · Academic Performance", "provides": "CGPA, backlogs",
             "source": "assessment.term_result → people.v_student_profile", "status": "stubbed (owned by another team)"},
            {"agent": "Agent 11 · Attendance Analysis", "provides": "attendance %",
             "source": "attendance.attendance_summary → v_current_attendance", "status": "stubbed (owned by another team)"},
        ],
        "feeds": [
            {"agent": "Agent 40 · Fee Management", "gives": "scholarship_expected + disbursement reconciliation",
             "target": "finance.fee_demand"},
            {"agent": "Agent 41 · Fee Due Reminder", "gives": "reminder suppression when a scholarship covers dues",
             "target": "finance.reminder_dispatch"},
            {"agent": "Agent 43 · Education Loan Support", "gives": "fee-paid / disbursement status",
             "target": "finance.scholarship_application"},
        ],
        "provenance": prov,
    }


def _notified_pairs(conn, student_ids=None) -> set:
    """(student_id, scheme name) pairs that already have a pending or sent notice."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT o.subject_id, o.payload->>'scheme' AS scheme
               FROM agentops.agent_output o
               JOIN agentops.agent_run r ON r.agent_run_id = o.agent_run_id
               WHERE r.agent_id = %s AND o.output_type = 'ALERT' AND o.subject_type = 'STUDENT'
                 AND o.approval_status IN ('PENDING','APPROVED')
                 AND (%s::uuid[] IS NULL OR o.subject_id = ANY(%s::uuid[]))""",
            (AGENT_ID, student_ids, student_ids))
        return {(str(x["subject_id"]), x["scheme"]) for x in cur.fetchall()}


def _notice(facts, scheme):
    docs = scheme.get("required_documents") or []
    deadline = scheme.get("application_closes") or "the published deadline"
    msg = (f"To {facts['full_name']} ({facts['roll_no']}): you are eligible for "
           f"{scheme['name']} — benefit {_rupees(scheme.get('benefit_amount'))}. "
           f"Apply by {deadline}. Documents required: "
           + (", ".join(docs) if docs else "as per scheme") + ".")
    payload = {"roll_no": facts["roll_no"], "student": facts["full_name"],
               "scheme": scheme["name"], "benefit": scheme.get("benefit_amount"),
               "deadline": scheme.get("application_closes"), "documents": docs}
    return payload, msg


def notify_all() -> dict:
    """Step 3 at scale: draft a notice for every eligible student who has not
    applied and has not already been notified. All drafts wait for approval."""
    with get_conn() as conn:
        students = get_students(conn)
        schemes = get_schemes(conn)
        apps = _application_index(conn)
        done = _notified_pairs(conn)
        run_id = start_run(conn, "USER", {"scope": "all_students"},
                           "Notify every eligible student who has not applied")
        record_input(conn, run_id, "people", "v_student_profile", len(students))
        record_input(conn, run_id, "finance", "scholarship_scheme", len(schemes))
        rows = []
        for f in students:
            for sc in schemes:
                if (f["student_id"], sc["scholarship_scheme_id"]) in apps:
                    continue
                if (f["student_id"], sc["name"]) in done:
                    continue
                if not evaluate(f, sc["eligibility_criteria"])["is_eligible"]:
                    continue
                payload, msg = _notice(f, sc)
                rows.append((run_id, f["student_id"], Jsonb(payload), msg))
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO agentops.agent_output
                     (agent_run_id, output_type, subject_type, subject_id, payload,
                      reasoning_summary, confidence, requires_approval, approval_status)
                   VALUES (%s, 'ALERT', 'STUDENT', %s, %s, %s, 0.99, true, 'PENDING')""", rows)
        finish_run(conn, run_id)
    return {"drafted": len(rows), "already_notified": len(done), "run_id": run_id}


def notify_student(student_id: str) -> dict:
    """Step 3 — notify a student of every scheme they are eligible for but have
    not applied to, with benefit, deadline and the document list. Each draft is
    an agent_output that WAITS for officer approval before it is 'sent'."""
    with get_conn() as conn:
        facts = get_facts(conn, student_id)
        if not facts:
            return {"error": "student not found"}
        schemes = get_schemes(conn)
        with conn.cursor() as cur:
            cur.execute("SELECT scholarship_scheme_id FROM finance.scholarship_application "
                        "WHERE student_id = %s", (student_id,))
            applied = {str(r["scholarship_scheme_id"]) for r in cur.fetchall()}
        done = _notified_pairs(conn, [student_id])

        run_id = start_run(conn, "USER", {"student_id": student_id},
                           f"Notify {facts['roll_no']} of eligible schemes")
        drafted = []
        for scheme in schemes:
            if scheme["scholarship_scheme_id"] in applied or (student_id, scheme["name"]) in done:
                continue
            if not evaluate(facts, scheme["eligibility_criteria"])["is_eligible"]:
                continue
            payload, msg = _notice(facts, scheme)
            write_output(conn, run_id, "ALERT", payload, msg,
                         subject_type="STUDENT", subject_id=student_id, requires_approval=True)
            drafted.append(scheme["name"])
        finish_run(conn, run_id)
        return {"drafted": len(drafted), "schemes": drafted, "roll_no": facts["roll_no"]}
