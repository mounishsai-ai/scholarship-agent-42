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
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
AGENT_USER_ID = os.environ.get("AGENT_USER_ID", "").strip()
AGENT_CODE = "A42_SCHOLARSHIP"


def db_configured() -> bool:
    return bool(DATABASE_URL)


# A pooled, always-warm connection. Opening a fresh psycopg connection per request
# costs the full TLS + auth handshake every time — sub-second in-region, but several
# seconds through the Cloud SQL Auth Proxy, which is what made the hero "Reading…"
# hang locally. The pool keeps min_size connections open and reuses them, so the
# handshake is paid once, not on every /api call. (connect_timeout keeps a truly
# unreachable DB failing fast instead of hanging the request forever.)
_pool: ConnectionPool | None = None


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=DATABASE_URL,
            # min_size is the pool's warm floor. The dashboard loads a panel by
            # firing its endpoints in parallel (Agent Activity needs seven), so a
            # floor of 1 meant the first burst after boot had to open six more
            # connections through the Cloud SQL Auth Proxy at once and some blew
            # the borrow timeout -> a 500 on first paint. Warm four up front.
            min_size=4, max_size=8,
            timeout=12,           # max wait to borrow a connection
            max_idle=300,         # recycle idle connections after 5 min
            kwargs={"row_factory": dict_row, "connect_timeout": 6},
            # Validate a connection before handing it out. Without this the pool
            # cheerfully returns connections the Cloud SQL Auth Proxy has already
            # dropped after an idle spell: the request 500s and only then is the
            # connection discarded, so the first N calls after a pause all fail at
            # once (very visible now the dashboard fetches panels in parallel).
            check=ConnectionPool.check_connection,
            open=True,
        )
    return _pool


@contextmanager
def get_conn(role_context: dict | None = None):
    """Yield a committed pooled connection with dict rows and session context set.

    role_context example: {"role_codes": "STUDENT", "student_id": "<uuid>"}
    """
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env and paste your "
            "Supabase connection string."
        )
    # pool.connection() commits on clean exit and rolls back on error, then returns
    # the connection to the pool (it is not closed). Session context is re-applied on
    # every checkout because pooled connections are reused across requests.
    with _get_pool().connection() as conn:
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


def query(sql: str, params: tuple = ()) -> list[dict]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def query_one(sql: str, params: tuple = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None
