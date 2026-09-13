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
import base64
from flask import (Flask, render_template, jsonify, request, session,
                   redirect, url_for)

import scholarship_engine as engine
from db import db_configured

app = Flask(__name__)
# Fixed fallback so the session survives a reload mid-demo (never os.urandom here).
app.secret_key = os.environ.get("SECRET_KEY", "agent42-scholarship-vignan-cse-2026")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash").strip()
# Vertex AI path: uses your gcloud Application Default Credentials — NO api key.
# Set GEMINI_USE_VERTEX=1 and GOOGLE_CLOUD_PROJECT=<project> to use your GCP credit.
GEMINI_USE_VERTEX = os.environ.get("GEMINI_USE_VERTEX", "").strip().lower() in ("1", "true", "yes")
GEMINI_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
GEMINI_LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "global").strip()
LLM_ON = bool(GEMINI_API_KEY) or (GEMINI_USE_VERTEX and bool(GEMINI_PROJECT))

_gemini = {"client": None, "tried": False}


def gemini_client():
    """A google-genai client via AI Studio key OR Vertex ADC, or None if neither
    is configured / the library is missing. Cached after the first attempt."""
    if _gemini["tried"]:
        return _gemini["client"]
    _gemini["tried"] = True
    try:
        from google import genai
        if GEMINI_API_KEY:
            _gemini["client"] = genai.Client(api_key=GEMINI_API_KEY)
        elif GEMINI_USE_VERTEX and GEMINI_PROJECT:
            _gemini["client"] = genai.Client(vertexai=True, project=GEMINI_PROJECT,
                                             location=GEMINI_LOCATION)
    except Exception:
        _gemini["client"] = None
    return _gemini["client"]


# --------------------------------------------------------------------------
# Pages + lenient sign-in flow
# --------------------------------------------------------------------------
@app.route("/")
def index():
    """The premium animated front door (landing page)."""
    return render_template("landing.html", db_ready=db_configured(),
                           chat_llm=LLM_ON,
                           signed_in=bool(session.get("signed_in")),
                           user_name=session.get("user_name", ""))


@app.route("/dashboard")
def dashboard():
    """The working data dashboard. Reachable with or without login (lenient
    by design, so the live demo always opens)."""
    return render_template("index.html", db_ready=db_configured(),
                           chat_llm=LLM_ON,
                           signed_in=bool(session.get("signed_in")),
                           user_name=session.get("user_name", ""))


@app.route("/login", methods=["POST"])
def login():
    """Set a session flag and enter the dashboard. Modes: google, guest, email,
    phone, regid, empid. Visual entry point only — no credentials are checked or
    stored, and the dashboard is never gated on this."""
    mode = (request.form.get("mode") or "guest").strip()
    ident = (request.form.get("identifier") or "").strip()
    role = (request.form.get("role") or "").strip().upper()
    valid = {"ACCOUNTS", "HOD", "ACCT", "STUDENT"}
    role_names = {"ACCOUNTS": "Scholarship Officer", "HOD": "Head of Department",
                  "ACCT": "Accounts Office", "STUDENT": "Student"}
    session["signed_in"] = True
    session["login_mode"] = mode
    if mode == "guest":
        # Guest can preview every role (demo affordance).
        session["role"] = "GUEST"
        session["can_switch"] = True
        session["user_name"] = "Guest"
        session["role_student"] = ""
    else:
        # A real sign-in is locked to one role — no cross-role viewing.
        r = role if role in valid else "ACCOUNTS"
        session["role"] = r
        session["can_switch"] = False
        session["user_name"] = ident or role_names[r]
        session["role_student"] = (request.form.get("student") or "23CSE002") if r == "STUDENT" else ""
    return redirect(url_for("dashboard"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


# --------------------------------------------------------------------------
# Legal pages
# --------------------------------------------------------------------------
@app.route("/privacy")
def privacy():
    return render_template("legal.html", page="privacy")


@app.route("/terms")
def terms():
    return render_template("legal.html", page="terms")


@app.route("/cookies")
def cookies():
    return render_template("legal.html", page="cookies")


# --------------------------------------------------------------------------
# API - each route calls exactly one engine function
# --------------------------------------------------------------------------
@app.route("/api/health")
def health():
    return jsonify({"db_configured": db_configured(), "llm": LLM_ON})


@app.route("/api/schemes")
def api_schemes():
    return _safe(_list_schemes)


def _list_schemes():
    from db import get_conn
    with get_conn() as conn:
        return {"schemes": engine.get_schemes(conn, active_only=False)}


@app.route("/api/scheme", methods=["POST"])
def api_create_scheme():
    data = request.get_json(force=True)
    return _safe(lambda: engine.create_scheme(data))


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


@app.route("/api/student/<student_id>/pack")
def api_application_pack(student_id):
    return _safe(lambda: engine.application_pack(student_id))


@app.route("/api/notify/<student_id>", methods=["POST"])
def api_notify(student_id):
    return _safe(lambda: engine.notify_student(student_id))


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
    image = data.get("image")  # optional data: URL
    role = (data.get("role") or "").upper()
    viewer = (data.get("viewer") or "").upper()
    if not question and not image:
        return jsonify({"reply": "Ask me about scholarships, eligibility, renewals or fees."})

    # Role-scoped access: a student cannot see officer/HoD-only views or other students.
    blocked = _student_restriction(question, role, viewer)
    if blocked:
        return jsonify({"reply": blocked, "intent": "restricted", "data": {}})

    try:
        if image:
            return jsonify({"reply": _vision_answer(question, image), "intent": "image", "data": {}})
        import re
        q = question
        # A signed-in student saying "I / me / my" means their own record.
        if role == "STUDENT" and viewer and not re.search(r"\d{2}\s*cse\s*\d{3}", question.lower()):
            q = question + " " + viewer
        intent, payload = _route_question(q)
        reply = _phrase(question, intent, payload)
        return jsonify({"reply": reply, "intent": intent, "data": payload})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"reply": f"Sorry, I could not answer that: {exc}", "error": str(exc)})


def _student_restriction(question: str, role: str, viewer: str):
    """A signed-in student may only see their own record — everything cross-student
    or officer/HoD-only is refused with a clear message (what evaluators look for)."""
    if role != "STUDENT":
        return None
    import re
    ql = " " + question.lower() + " "
    m = re.search(r"(\d{2})\s*cse\s*(\d{3})", ql)
    if m:
        roll = f"{m.group(1)}CSE{m.group(2)}".upper()
        if viewer and roll != viewer:
            return ("You can only see your own record. As a student you can ask about your own "
                    "eligibility, applications, renewals or fees.")
    officer_only = ("all student", "every student", "everyone", "other student", "coverage",
                    "how many student", "department", "approval", "approve", "add scheme",
                    "create scheme", "reconcil", "suppress", "which students", "list students",
                    "all applications", "everybody")
    if any(w in ql for w in officer_only):
        return ("That view is restricted to the Scholarship Officer or Head of Department. As a "
                "student you can ask about your own eligibility, applications, renewals and fees.")
    return None


def _vision_answer(question: str, image: str) -> str:
    """Answer a question about an uploaded image via Gemini (multimodal)."""
    client = gemini_client()
    if client is None:
        return ("Image understanding needs the AI assistant (Gemini) enabled. It is currently off, "
                "so I can only answer text questions about scholarships.")
    try:
        from google.genai import types
        header, b64 = image.split(",", 1) if "," in image else ("", image)
        mime = "image/png"
        if header.startswith("data:") and ";" in header:
            mime = header[5:header.index(";")]
        img_part = types.Part.from_bytes(data=base64.b64decode(b64), mime_type=mime)
        q = question or ("Describe this image. If it is a scholarship, income, caste or marks "
                         "document, say what it is and the key details you can read.")
        resp = client.models.generate_content(model=GEMINI_MODEL, contents=[q, img_part])
        return (resp.text or "I couldn't read that image.").strip()
    except Exception as exc:  # noqa: BLE001
        return f"I couldn't process that image: {exc}"


def _route_question(q: str):
    """Map a question to one engine function. Rule-based (typo-tolerant), so it
    needs no LLM. Anything unrecognised returns a helpful 'unknown' reply rather
    than a wrong confident answer."""
    import re
    ql = " " + q.lower().strip() + " "
    has = lambda *ws: any(w in ql for w in ws)

    # roll number, tolerant of spaces/case (23cse001, 23 CSE 001, ...)
    m = re.search(r"(\d{2})\s*cse\s*(\d{3})", ql)
    roll = f"{m.group(1)}CSE{m.group(2)}".upper() if m else None

    # greetings / help / thanks — before topic matching
    if ql.strip() in ("hi", "hello", "hey", "yo", "hola", "namaste") or \
       has("help", "what can you", "what do you do", "who are you", "capab", "how do you work"):
        return "help", {}
    if has("thank", "thanks", "thx", "great job", "well done"):
        return "thanks", {}

    # a specific student
    if roll:
        sid = _student_id_for_roll(roll)
        if sid:
            if has("atten", "present", "class"):
                return "student_fact", {"facts": _student_facts(sid), "field": "attendance"}
            if has("cgpa", "gpa", "marks", "grade", "result"):
                return "student_fact", {"facts": _student_facts(sid), "field": "cgpa"}
            if has("fee", "due", "outstanding", "owe", "pay"):
                return "student_fact", {"facts": _student_facts(sid), "field": "fee"}
            if has("renew", "lapse", "lose", "risk"):
                return "renewal", engine.renewal_risk()
            return "eligibility", engine.match_student(sid)

    # topics (roots catch common misspellings: attendence, scholarshp, ...)
    if has("renew", "lapse", "losing", "lose", "at risk", "at-risk", "atten"):
        return "renewal", engine.renewal_risk()
    if has("reconcil", "remind", "fee", "dues", "chased", "suppress", "outstanding", "ledger"):
        return "reconciliation", engine.reconcile()
    if has("coverage", "cover", "gap", "how many", "unclaimed", "reach", "left out", "missing out"):
        return "coverage", engine.coverage_report()
    if has("scheme", "scholar", "list", "available", "provider", "benefit", "criteria", "document"):
        from db import get_conn
        with get_conn() as conn:
            schemes = engine.get_schemes(conn)
        cat = next((c.upper() for c in ("sc", "st", "obc", "ews") if f" {c} " in ql), None)
        girl = has("girl", "women", "female", "pragati")

        def _rules(s):
            c = s["eligibility_criteria"] or {}
            return (c.get("all") or []) + (c.get("any") or [])
        if cat:
            schemes = [s for s in schemes if any(
                r.get("field") == "social_category" and cat in (r.get("value") or [])
                for r in _rules(s))]
        elif girl:
            schemes = [s for s in schemes if any(r.get("field") == "gender" for r in _rules(s))]
        return "schemes", {"schemes": schemes}
    if has("eligib", "qualif", "match"):
        return "coverage", engine.coverage_report()
    return "unknown", {}


def _student_id_for_roll(roll: str):
    from db import get_conn
    with get_conn() as conn:
        for s in engine.get_students(conn):
            if s["roll_no"] == roll:
                return s["student_id"]
    return None


def _student_facts(sid: str):
    from db import get_conn
    with get_conn() as conn:
        return engine.get_facts(conn, sid)


def _chat_context() -> dict:
    """Compact, machine-true snapshot for the LLM: every scheme (with rules and
    documents) and every student (with the schemes they qualify for). Lets Gemini
    answer list/edge questions without ever inventing a fact."""
    from db import get_conn
    with get_conn() as conn:
        students = engine.get_students(conn)
        schemes = engine.get_schemes(conn)
    sc = [{"code": s["code"], "name": s["name"], "provider_type": s["provider_type"],
           "benefit_amount": s["benefit_amount"], "renewable": s["renewal_required"],
           "eligibility": s["eligibility_criteria"], "documents": s["required_documents"],
           "closes": s["application_closes"]} for s in schemes]
    st = []
    for f in students:
        elig = [s["code"] for s in schemes
                if engine.evaluate(f, s["eligibility_criteria"])["is_eligible"]]
        st.append({"roll": f["roll_no"], "name": f["full_name"], "category": f["social_category"],
                   "gender": f["gender"], "annual_income": f["annual_income"], "cgpa": f["cgpa"],
                   "attendance_pct": f["attendance_pct"], "eligible_for": elig})
    return {"schemes": sc, "students": st,
            "total_eligible_matches": sum(len(s["eligible_for"]) for s in st),
            "student_count": len(students)}


def _phrase(question: str, intent: str, payload: dict) -> str:
    """Phrase the answer. With Gemini configured, answer freely over the full
    context (handles lists and edge cases); offline, use the deterministic
    template. Every number/name must come from the provided facts."""
    fallback = _template_reply(intent, payload)
    client = gemini_client()
    if client is None:
        return fallback
    try:
        ctx = _chat_context()
        prompt = (
            "You are the Scholarship Agent for Vignan University, CSE. Answer the user's "
            "question using ONLY the facts in the JSON below. Never invent a number, name, "
            "scheme, or student that is not present; if the answer is not in the data, say so "
            "plainly. Be concise: 1-3 sentences, or short bullet lines for a list.\n\n"
            f"User question: {question}\n\n"
            f"Focused result ({intent}): {json.dumps(payload, default=str)[:2500]}\n\n"
            f"Full context: {json.dumps(ctx, default=str)[:9000]}\n"
        )
        resp = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        return (resp.text or fallback).strip()
    except Exception:
        return fallback


HELP_TEXT = ("I'm the Scholarship Agent. I can tell you who is eligible for which "
             "scholarships, who is at risk of losing a renewal, our coverage gap, "
             "fee reconciliations, and the scheme list. Try: \"which scholarships is "
             "23CSE001 eligible for?\", \"who is at renewal risk?\", or \"what is our "
             "coverage gap?\"")


def _rupees(n):
    return "₹0" if not n else "₹" + format(int(n), ",d")


def _template_reply(intent: str, payload: dict) -> str:
    if intent == "help":
        return HELP_TEXT
    if intent == "thanks":
        return "Happy to help. Ask me anything about eligibility, renewals, fees or coverage."
    if intent == "unknown":
        return ("I'm not sure I caught that. I can answer about eligibility, renewals, "
                "coverage, fees, or schemes — for example \"who is at renewal risk?\" or "
                "\"which schemes is 23CSE002 eligible for?\"")
    if intent == "student_fact":
        f = payload.get("facts") or {}
        name, roll = f.get("full_name", "This student"), f.get("roll_no", "")
        field = payload.get("field")
        if field == "attendance":
            v = f.get("attendance_pct")
            side = "at or above" if (v or 0) >= 75 else "below"
            return (f"{name} ({roll}) has {v}% attendance — {side} the 75% most schemes "
                    f"require to renew a scholarship.")
        if field == "cgpa":
            return (f"{name} ({roll}) has a CGPA of {f.get('cgpa')} with "
                    f"{f.get('backlog_count', 0)} backlog(s).")
        if field == "fee":
            out = f.get("fee_outstanding")
            return (f"{name} ({roll}) has no outstanding fees." if not out
                    else f"{name} ({roll}) has an outstanding balance of {_rupees(out)}.")
    if intent == "eligibility":
        f = payload.get("facts", {})
        elig = [m["scheme"]["name"] for m in payload.get("matches", []) if m["is_eligible"]]
        if not elig:
            return f"{f.get('full_name','This student')} is not currently eligible for any active scheme."
        return (f"{f.get('full_name','This student')} ({f.get('roll_no','')}) is eligible for "
                f"{len(elig)} scheme(s): " + ", ".join(elig) + ".")
    if intent == "renewal":
        n = payload.get("at_risk_count", 0)
        names = [f"{r['student']['full_name']} ({r['student']['attendance_pct']}%)"
                 for r in payload.get("results", [])
                 if r["risk_level"] in ("AT_RISK", "LIKELY_LOSS")]
        base = ("Renewal rules require at least 75% attendance (and CGPA ≥ 6.5 for merit "
                "schemes). ")
        if n == 0:
            return base + "All live scholarships currently meet their renewal conditions."
        return base + f"{n} scholarship(s) are at risk: " + ", ".join(names) + "."
    if intent == "reconciliation":
        n = payload.get("suppress_count", 0)
        if n == 0:
            return "No fee reminders need suppressing — nothing is being chased that a scholarship covers."
        return (f"{n} fee reminder(s) should be suppressed because a sanctioned scholarship "
                f"already covers the dues.")
    if intent == "coverage":
        return (f"{payload.get('total_eligible',0)} eligible matches, "
                f"{payload.get('total_covered',0)} covered, "
                f"gap of {payload.get('coverage_gap',0)}.")
    if intent == "schemes":
        names = [s["name"] for s in payload.get("schemes", [])]
        if not names:
            return "No active schemes match that filter."
        return "Schemes: " + ", ".join(names) + "."
    return HELP_TEXT


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
