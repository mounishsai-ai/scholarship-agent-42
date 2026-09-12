"""
Scholarship Agent (Agent 42) - Flask web server.

Serves the dashboard and a small JSON API. Each API route is a thin wrapper
that calls one function in scholarship_engine.py and returns its result as JSON.
The /api/chat route is the only place the LLM is used: Gemini decides which
engine function answers the question and phrases the result, but every number
still comes from the engine, so the app works with no API key and no internet.
"""
import os
import json
from flask import (Flask, render_template, jsonify, request, session,
                   redirect, url_for)

import scholarship_engine as engine
from db import db_configured

app = Flask(__name__)
# Fixed fallback so the session survives a reload mid-demo (never os.urandom here).
app.secret_key = os.environ.get("SECRET_KEY", "agent42-scholarship-vignan-cse-2026")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash").strip()


# --------------------------------------------------------------------------
# Pages + lenient sign-in flow
# --------------------------------------------------------------------------
@app.route("/")
def index():
    """The premium animated front door (landing page)."""
    return render_template("landing.html", db_ready=db_configured(),
                           chat_llm=bool(GEMINI_API_KEY),
                           signed_in=bool(session.get("signed_in")),
                           user_name=session.get("user_name", ""))


@app.route("/dashboard")
def dashboard():
    """The working data dashboard. Reachable with or without login (lenient
    by design, so the live demo always opens)."""
    return render_template("index.html", db_ready=db_configured(),
                           chat_llm=bool(GEMINI_API_KEY),
                           signed_in=bool(session.get("signed_in")),
                           user_name=session.get("user_name", ""))


@app.route("/login", methods=["POST"])
def login():
    """Set a session flag and enter the dashboard. Modes: google, guest, email,
    phone, regid, empid. Visual entry point only — no credentials are checked or
    stored, and the dashboard is never gated on this."""
    mode = (request.form.get("mode") or "guest").strip()
    ident = (request.form.get("identifier") or "").strip()
    defaults = {"guest": "Guest", "google": "Scholarship Officer",
                "email": "Scholarship Officer", "phone": "Scholarship Officer",
                "regid": "Student", "empid": "Faculty"}
    session["signed_in"] = True
    session["user_name"] = ident or defaults.get(mode, "Scholarship Officer")
    session["login_mode"] = mode
    return redirect(url_for("dashboard"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


# --------------------------------------------------------------------------
# API - each route calls exactly one engine function
# --------------------------------------------------------------------------
@app.route("/api/health")
def health():
    return jsonify({"db_configured": db_configured(), "llm": bool(GEMINI_API_KEY)})


@app.route("/api/schemes")
def api_schemes():
    return _safe(_list_schemes)


def _list_schemes():
    from db import get_conn
    with get_conn() as conn:
        return {"schemes": engine.get_schemes(conn, active_only=False)}


@app.route("/api/students")
def api_students():
    return _safe(_students)


def _students():
    from db import get_conn
    with get_conn() as conn:
        return {"students": engine.get_students(conn)}


@app.route("/api/matrix")
def api_matrix():
    return _safe(engine.match_matrix)


@app.route("/api/student/<student_id>/eligibility")
def api_student_eligibility(student_id):
    return _safe(lambda: engine.match_student(student_id))


@app.route("/api/applications")
def api_applications():
    return _safe(lambda: {"applications": engine.applications()})


@app.route("/api/renewal-risk")
def api_renewal_risk():
    return _safe(engine.renewal_risk)


@app.route("/api/reconciliation")
def api_reconciliation():
    return _safe(engine.reconcile)


@app.route("/api/coverage")
def api_coverage():
    return _safe(engine.coverage_report)


@app.route("/api/flags")
def api_flags():
    return _safe(lambda: {"flags": engine.open_flags()})


@app.route("/api/runs")
def api_runs():
    return _safe(lambda: {"runs": engine.recent_runs()})


@app.route("/api/approvals")
def api_approvals():
    return _safe(lambda: {"approvals": engine.pending_approvals()})


@app.route("/api/approve", methods=["POST"])
def api_approve():
    data = request.get_json(force=True)
    return _safe(lambda: engine.approve_output(
        data["agent_output_id"], data.get("decision", "APPROVE"), data.get("note", "")))


@app.route("/api/suppress-reminder", methods=["POST"])
def api_suppress():
    data = request.get_json(force=True)
    return _safe(lambda: engine.suppress_reminder(
        data["reminder_dispatch_id"], data.get("note", "")))


# --------------------------------------------------------------------------
# Chat - Gemini picks a function; the engine supplies the facts
# --------------------------------------------------------------------------
@app.route("/api/chat", methods=["POST"])
def api_chat():
    data = request.get_json(force=True)
    question = (data.get("message") or "").strip()
    if not question:
        return jsonify({"reply": "Ask me about scholarships, eligibility, renewals or fees."})
    try:
        intent, payload = _route_question(question)
        reply = _phrase(question, intent, payload)
        return jsonify({"reply": reply, "intent": intent, "data": payload})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"reply": f"Sorry, I could not answer that: {exc}", "error": str(exc)})


def _route_question(q: str):
    """Map a question to one engine function. Rule-based, so it needs no LLM."""
    ql = q.lower()
    # Is a roll number mentioned?
    import re
    roll = None
    m = re.search(r"\b\d{2}cse\d{3}\b", ql)
    if m:
        roll = m.group(0).upper()

    if roll:
        sid = _student_id_for_roll(roll)
        if sid:
            return "eligibility", engine.match_student(sid)

    if any(w in ql for w in ("renew", "lose", "losing", "at risk", "attendance")):
        return "renewal", engine.renewal_risk()
    if any(w in ql for w in ("reconcile", "reminder", "fee", "chased", "suppress", "dues")):
        return "reconciliation", engine.reconcile()
    if any(w in ql for w in ("coverage", "how many", "gap", "covered", "eligible students")):
        return "coverage", engine.coverage_report()
    if any(w in ql for w in ("scheme", "schemes", "which scholarship", "list")):
        from db import get_conn
        with get_conn() as conn:
            return "schemes", {"schemes": engine.get_schemes(conn)}
    return "coverage", engine.coverage_report()


def _student_id_for_roll(roll: str):
    from db import get_conn
    with get_conn() as conn:
        for s in engine.get_students(conn):
            if s["roll_no"] == roll:
                return s["student_id"]
    return None


def _phrase(question: str, intent: str, payload: dict) -> str:
    """Turn engine output into a sentence. Uses Gemini if a key is present,
    otherwise a deterministic template. Numbers always come from `payload`."""
    fallback = _template_reply(intent, payload)
    if not GEMINI_API_KEY:
        return fallback
    try:
        from google import genai
        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = (
            "You are the Scholarship Agent for a college. Answer the user's question "
            "using ONLY the JSON facts provided. Be concise, factual, and do not invent "
            "any number that is not in the JSON.\n\n"
            f"Question: {question}\n\nFacts (JSON):\n{json.dumps(payload, default=str)[:6000]}\n\n"
            "Answer in 2-4 sentences."
        )
        resp = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        return (resp.text or fallback).strip()
    except Exception:
        return fallback


def _template_reply(intent: str, payload: dict) -> str:
    if intent == "eligibility":
        f = payload.get("facts", {})
        elig = [m["scheme"]["name"] for m in payload.get("matches", []) if m["is_eligible"]]
        if not elig:
            return f"{f.get('full_name','This student')} is not currently eligible for any active scheme."
        return (f"{f.get('full_name','This student')} ({f.get('roll_no','')}) is eligible for "
                f"{len(elig)} scheme(s): " + ", ".join(elig) + ".")
    if intent == "renewal":
        n = payload.get("at_risk_count", 0)
        names = [r["student"]["full_name"] for r in payload.get("results", [])
                 if r["risk_level"] in ("AT_RISK", "LIKELY_LOSS")]
        return (f"{n} live scholarship(s) are at risk of non-renewal"
                + (": " + ", ".join(names) if names else "") + ".")
    if intent == "reconciliation":
        n = payload.get("suppress_count", 0)
        return (f"{n} fee reminder(s) should be suppressed because a sanctioned scholarship "
                f"already covers the dues.")
    if intent == "coverage":
        return (f"{payload.get('total_eligible',0)} eligible matches, "
                f"{payload.get('total_covered',0)} covered, "
                f"gap of {payload.get('coverage_gap',0)}.")
    if intent == "schemes":
        names = [s["name"] for s in payload.get("schemes", [])]
        return "Active schemes: " + ", ".join(names) + "."
    return "Here is what I found."


# --------------------------------------------------------------------------
# helper: run engine call, convert errors to a clean JSON response
# --------------------------------------------------------------------------
def _safe(fn):
    if not db_configured():
        return jsonify({"error": "DATABASE_URL not set. Copy .env.example to .env and add "
                                 "your Supabase connection string, then restart."}), 503
    try:
        return jsonify(fn())
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
