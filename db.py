"""
Database access for the Scholarship Agent (Agent 42).

One thin connection helper. Every connection sets the documented session
context from 11_security_rls.sql (app.user_id, app.agent_code, and an optional
role context for the "view as" switcher) so the audit trigger records who acted
and so row-level security has the context it expects. We connect as the Supabase
`postgres` role, which bypasses RLS, so the demo is reliable; the session context
is still set for authenticity and audit.
"""
import os
import psycopg
from psycopg.rows import dict_row
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
AGENT_USER_ID = os.environ.get("AGENT_USER_ID", "").strip()
AGENT_CODE = "A42_SCHOLARSHIP"


def db_configured() -> bool:
    return bool(DATABASE_URL)


@contextmanager
def get_conn(role_context: dict | None = None):
    """Yield a committed connection with dict rows and session context set.

    role_context example: {"role_codes": "STUDENT", "student_id": "<uuid>"}
    """
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env and paste your "
            "Supabase connection string."
        )
    # connect_timeout so a stopped/unreachable DB fails fast with a clear error
    # instead of hanging the request (which shows as "agent running" forever).
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=False,
                           connect_timeout=6)
    try:
        with conn.cursor() as cur:
            if AGENT_USER_ID:
                cur.execute("SELECT set_config('app.user_id', %s, false)", (AGENT_USER_ID,))
            cur.execute("SELECT set_config('app.agent_code', %s, false)", (AGENT_CODE,))
            if role_context:
                for key, value in role_context.items():
                    cur.execute(
                        "SELECT set_config(%s, %s, false)",
                        (f"app.{key}", "" if value is None else str(value)),
                    )
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def query(sql: str, params: tuple = ()) -> list[dict]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def query_one(sql: str, params: tuple = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None
