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
        "cgpa": _jsonable(row["cgpa"]),
        "backlog_count": row["backlog_count"],
        "attendance_pct": _jsonable(row["attendance_pct"]),
        "fee_outstanding": _jsonable(row["fee_outstanding"]),
        "social_category": row["social_category"],
        "gender": row["gender"],
        "annual_income": _jsonable(row["annual_income"]),
    }


def get_students(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(STUDENT_FACTS_SQL + " WHERE p.roll_no LIKE '23CSE%' ORDER BY p.roll_no")
        return [_facts_row_to_dict(r) for r in cur.fetchall()]


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
                   latency_ms = (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int
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


def match_matrix() -> dict:
    """The full students x schemes eligibility matrix."""
    with get_conn() as conn:
        students = get_students(conn)
        schemes = get_schemes(conn)
        run_id = start_run(conn, "USER", {"scope": "all_students"},
                           "Build eligibility matrix for all students")
        record_input(conn, run_id, "people", "v_student_profile", len(students))
        record_input(conn, run_id, "finance", "scholarship_scheme", len(schemes))
        rows = []
        eligible_cells = 0
        for facts in students:
            cells = []
            for scheme in schemes:
                verdict = evaluate(facts, scheme["eligibility_criteria"])
                if verdict["is_eligible"]:
                    eligible_cells += 1
                cells.append({
                    "scheme_code": scheme["code"],
                    "is_eligible": verdict["is_eligible"],
                    "criteria_result": verdict["criteria_result"],
                    "reason": _reason_line(facts, scheme, verdict),
                })
            rows.append({"student": facts, "cells": cells})
        write_output(conn, run_id, "REPORT",
                     {"students": len(students), "schemes": len(schemes),
                      "eligible_cells": eligible_cells},
                     f"Evaluated {len(students)} students against {len(schemes)} schemes "
                     f"({eligible_cells} eligible matches).")
        finish_run(conn, run_id)
        return {"schemes": schemes, "rows": rows, "run_id": run_id}


def renewal_risk() -> dict:
    """Check every live scholarship against its renewal rules; raise risk flags."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT app.scholarship_application_id, app.student_id, app.status,
                          sc.name AS scheme_name, sc.code AS scheme_code,
                          sc.renewal_criteria
                   FROM finance.scholarship_application app
                   JOIN finance.scholarship_scheme sc
                     ON sc.scholarship_scheme_id = app.scholarship_scheme_id
                   WHERE app.status IN ('SANCTIONED','DISBURSED')
                     AND sc.renewal_required = true""")
            live = cur.fetchall()

        run_id = start_run(conn, "SCHEDULED", {"scope": "live_scholarships"},
                           "Assess renewal risk for all live scholarships")
        record_input(conn, run_id, "finance", "scholarship_application", len(live))
        results = []
        for app in live:
            facts = get_facts(conn, str(app["student_id"]))
            verdict = evaluate(facts, app["renewal_criteria"])
            level = _risk_level(verdict)
            _persist_renewal_risk(conn, app["scholarship_application_id"], facts, verdict, level)
            flagged = False
            if level in ("AT_RISK", "LIKELY_LOSS"):
                _raise_scholarship_flag(conn, run_id, facts, app, verdict, level)
                flagged = True
            reason = (f"{facts['full_name']} ({facts['roll_no']}) - {app['scheme_name']}: "
                      f"renewal risk {level}. " +
                      ("; ".join(f"{r['field_label']} {r['actual']} needs "
                                 f"{r['op_label']} {r['expected']}" for r in verdict["unmet"])
                       if verdict["unmet"] else "all renewal conditions met."))
            results.append({
                "application_id": str(app["scholarship_application_id"]),
                "student": facts, "scheme_name": app["scheme_name"],
                "scheme_code": app["scheme_code"], "risk_level": level,
                "criteria_result": verdict["criteria_result"],
                "reason": reason, "flag_raised": flagged,
            })
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


def _persist_renewal_risk(conn, application_id, facts, verdict, level):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO finance.scholarship_renewal_risk
                 (scholarship_application_id, assessed_on, attendance_pct, cgpa,
                  criteria_at_risk, risk_level, alerted_at)
               VALUES (%s, current_date, %s, %s, %s, %s,
                       CASE WHEN %s IN ('AT_RISK','LIKELY_LOSS') THEN now() ELSE NULL END)""",
            (application_id, facts.get("attendance_pct"), facts.get("cgpa"),
             Jsonb(verdict["unmet"]), level, level),
        )


def _raise_scholarship_flag(conn, run_id, facts, app, verdict, level):
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
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO agentops.risk_flag
                 (agent_id, agent_run_id, subject_type, student_id, flag_type, severity,
                  observed_value, deviation_summary, contributing_signals,
                  suggested_first_action, responder_user_id, respond_by)
               VALUES (%s, %s, 'STUDENT', %s, 'SCHOLARSHIP_RISK', %s, %s, %s, %s, %s, %s,
                       now() + interval '5 days')""",
            (AGENT_ID, run_id, facts["student_id"], severity,
             facts.get("attendance_pct"),
             f"{app['scheme_name']} renewal at {level} for {facts['roll_no']}",
             Jsonb(signals), action, AGENT_USER_ID or None),
        )


def reconcile() -> dict:
    """Match disbursements to the fee ledger; flag reminders that must be suppressed."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT app.student_id, per.full_name, st.roll_no,
                          app.status AS app_status, app.sanctioned_amount, app.disbursed_amount,
                          sc.name AS scheme_name,
                          fd.fee_demand_id, fd.net_payable, fd.paid_amount, fd.outstanding,
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
        results = []
        suppress_count = 0
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
            results.append({
                "student_id": str(r["student_id"]), "roll_no": r["roll_no"],
                "full_name": r["full_name"], "scheme_name": r["scheme_name"],
                "app_status": r["app_status"], "covered_amount": covered,
                "outstanding": outstanding,
                "scholarship_expected": _jsonable(r["scholarship_expected"]),
                "active_reminder": bool(r["reminder_dispatch_id"]),
                "reminder_dispatch_id": str(r["reminder_dispatch_id"]) if r["reminder_dispatch_id"] else None,
                "reminder_segment": r["segment"],
                "recommend_suppress": recommend_suppress,
                "recommendation": recommendation,
            })
        write_output(conn, run_id, "RECOMMENDATION",
                     {"reconciled": len(results), "reminders_to_suppress": suppress_count},
                     f"Reconciled {len(results)} live scholarships; recommended suppressing "
                     f"{suppress_count} fee reminder(s) already covered by a scholarship.",
                     requires_approval=suppress_count > 0)
        finish_run(conn, run_id)
        return {"results": results, "suppress_count": suppress_count, "run_id": run_id}


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


def applications() -> list[dict]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT app.scholarship_application_id, st.roll_no, per.full_name,
                      sc.name AS scheme_name, sc.code AS scheme_code, sc.provider_type,
                      app.status, app.external_application_no, app.applied_on,
                      app.sanctioned_amount, app.disbursed_amount, app.disbursed_on,
                      app.rejection_reason
               FROM finance.scholarship_application app
               JOIN finance.scholarship_scheme sc ON sc.scholarship_scheme_id = app.scholarship_scheme_id
               JOIN people.student st ON st.student_id = app.student_id
               JOIN people.person per ON per.person_id = st.person_id
               ORDER BY app.applied_on DESC NULLS LAST""")
        rows = cur.fetchall()
    for r in rows:
        r["scholarship_application_id"] = str(r["scholarship_application_id"])
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
        per_scheme = []
        total_eligible = 0
        total_covered = 0
        for scheme in schemes:
            eligible = sum(1 for f in students
                           if evaluate(f, scheme["eligibility_criteria"])["is_eligible"])
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT count(*) FILTER (WHERE status IN
                                ('SUBMITTED','INSTITUTION_VERIFIED','SANCTIONED','DISBURSED')) AS applied,
                              count(*) FILTER (WHERE status IN ('SANCTIONED','DISBURSED')) AS covered
                       FROM finance.scholarship_application
                       WHERE scholarship_scheme_id = %s""",
                    (scheme["scholarship_scheme_id"],))
                c = cur.fetchone()
            total_eligible += eligible
            total_covered += c["covered"]
            per_scheme.append({
                "scheme_code": scheme["code"], "scheme_name": scheme["name"],
                "eligible": eligible, "applied": c["applied"], "covered": c["covered"],
                "gap": eligible - c["covered"],
            })
        with conn.cursor() as cur:
            cur.execute(
                """SELECT rejection_reason, count(*) AS n
                   FROM finance.scholarship_application
                   WHERE status = 'REJECTED' AND rejection_reason IS NOT NULL
                   GROUP BY rejection_reason ORDER BY n DESC""")
            rejections = cur.fetchall()
        return {
            "per_scheme": per_scheme,
            "total_eligible": total_eligible,
            "total_covered": total_covered,
            "coverage_gap": total_eligible - total_covered,
            "rejections": rejections,
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
               WHERE f.flag_type = 'SCHOLARSHIP_RISK'
               ORDER BY f.raised_at DESC""")
        rows = cur.fetchall()
    for r in rows:
        r["risk_flag_id"] = str(r["risk_flag_id"])
        r["raised_at"] = r["raised_at"].isoformat() if r["raised_at"] else None
    return rows


def pending_approvals() -> list[dict]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT o.agent_output_id, o.output_type, o.reasoning_summary, o.payload,
                      o.created_at
               FROM agentops.agent_output o
               WHERE o.approval_status = 'PENDING'
               ORDER BY o.created_at DESC""")
        rows = cur.fetchall()
    for r in rows:
        r["agent_output_id"] = str(r["agent_output_id"])
        r["created_at"] = r["created_at"].isoformat() if r["created_at"] else None
    return rows


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
                (agent_output_id, AGENT_USER_ID or None, decision, note or None))
        return {"ok": True, "status": status}


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
        packs = []
        for scheme in schemes:
            if not evaluate(facts, scheme["eligibility_criteria"])["is_eligible"]:
                continue
            packs.append({
                "scheme": scheme["name"], "code": scheme["code"],
                "benefit": _rupees(scheme.get("benefit_amount")),
                "deadline": scheme.get("application_closes") or "as published",
                "documents": scheme.get("required_documents") or [],
            })
        return {"facts": facts, "prefilled": prefilled, "packs": packs}


def integration_report() -> dict:
    """Evidence that the agent runs on the shared platform database and honours
    its declared integrations (consumes Agents 10, 11; feeds Agents 40, 41, 43).
    Every count is queried live, and the provenance rows are real agent_run_input
    records — proof that answers trace back to database records."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT (SELECT count(*) FROM people.student WHERE roll_no LIKE '23CSE%%') AS students,
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

        run_id = start_run(conn, "USER", {"student_id": student_id},
                           f"Notify {facts['roll_no']} of eligible schemes")
        drafted = []
        for scheme in schemes:
            if scheme["scholarship_scheme_id"] in applied:
                continue
            if not evaluate(facts, scheme["eligibility_criteria"])["is_eligible"]:
                continue
            docs = scheme.get("required_documents") or []
            deadline = scheme.get("application_closes") or "the published deadline"
            msg = (f"To {facts['full_name']} ({facts['roll_no']}): you are eligible for "
                   f"{scheme['name']} — benefit {_rupees(scheme.get('benefit_amount'))}. "
                   f"Apply by {deadline}. Documents required: "
                   + (", ".join(docs) if docs else "as per scheme") + ".")
            write_output(conn, run_id, "ALERT",
                         {"roll_no": facts["roll_no"], "student": facts["full_name"],
                          "scheme": scheme["name"], "benefit": scheme.get("benefit_amount"),
                          "deadline": scheme.get("application_closes"), "documents": docs},
                         msg, subject_type="STUDENT", subject_id=student_id,
                         requires_approval=True)
            drafted.append(scheme["name"])
        finish_run(conn, run_id)
        return {"drafted": len(drafted), "schemes": drafted, "roll_no": facts["roll_no"]}
