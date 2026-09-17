"""
Student sign-in for the Scholarship Agent (Agent 42).

Accounts live in the platform's own identity.app_user table (username = the
student's register number). The platform schema has no password column, and
app_user is shared by every agent, so Agent 42 keeps its password hashes in a
separate, additive table: identity.agent42_credential. Hashing is bcrypt via
pgcrypto (already enabled by schema_full.sql), so no extra Python dependency.

A fresh account's password is the register number itself (is_default = true);
the student can change it from the profile menu.
"""
from db import get_conn

CREDENTIAL_DDL = """
CREATE TABLE IF NOT EXISTS identity.agent42_credential (
    user_id       uuid PRIMARY KEY REFERENCES identity.app_user ON DELETE CASCADE,
    password_hash text NOT NULL,
    is_default    boolean NOT NULL DEFAULT true,
    changed_at    timestamptz
);
COMMENT ON TABLE identity.agent42_credential IS
  'Agent 42 (Scholarship) student sign-in: bcrypt hashes (pgcrypto crypt/gen_salt). '
  'Additive — identity.app_user is shared by every agent and is not altered.';
"""

MIN_PASSWORD_LEN = 6

# Find the one account first, then run bcrypt on that row only. With crypt() in
# the WHERE clause the planner may hash the password against every account
# (1000 bcrypt rounds ≈ 2 s per sign-in).
_LOOKUP_SQL = """
    SELECT u.user_id, s.roll_no, s.student_id, per.full_name, c.is_default,
           (c.password_hash = crypt(%s, c.password_hash)) AS password_ok
    FROM identity.app_user u
    JOIN identity.agent42_credential c ON c.user_id = u.user_id
    JOIN people.student s ON s.person_id = u.person_id
    JOIN people.person per ON per.person_id = u.person_id
    WHERE upper(u.username) = upper(%s) AND u.is_active
"""


def verify_student(regno: str, password: str) -> dict | None:
    """Return the student's account if the register number + password match."""
    regno = (regno or "").strip()
    if not regno or not password:
        return None
    # The default password is the register number; accept it in any letter case
    # (a chosen password can never equal the register number, see change_password).
    if password.strip().upper() == regno.upper():
        password = regno.upper()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(_LOOKUP_SQL, (password, regno))
        row = cur.fetchone()
        if not row or not row["password_ok"]:
            return None
        cur.execute("UPDATE identity.app_user SET last_login_at = now() WHERE user_id = %s",
                    (row["user_id"],))
    return {"user_id": str(row["user_id"]), "roll_no": row["roll_no"],
            "student_id": str(row["student_id"]), "full_name": row["full_name"],
            "is_default": row["is_default"]}


def change_password(regno: str, current: str, new: str) -> dict:
    """Change a student's password after re-checking the current one."""
    new = new or ""
    if len(new) < MIN_PASSWORD_LEN:
        return {"error": f"The new password must be at least {MIN_PASSWORD_LEN} characters."}
    if new == current:
        return {"error": "The new password must be different from the current one."}
    if new.strip().upper() == (regno or "").strip().upper():
        return {"error": "Choose a password other than your register number."}
    account = verify_student(regno, current)
    if not account:
        return {"error": "Your current password is incorrect."}
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE identity.agent42_credential
               SET password_hash = crypt(%s, gen_salt('bf', 8)),
                   is_default = false, changed_at = now()
               WHERE user_id = %s""",
            (new, account["user_id"]))
    return {"ok": True}


def is_default_password(regno: str) -> bool:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT c.is_default FROM identity.app_user u
               JOIN identity.agent42_credential c ON c.user_id = u.user_id
               WHERE upper(u.username) = upper(%s)""", (regno,))
        row = cur.fetchone()
    return bool(row and row["is_default"])
