import logging
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings, ON_VERCEL

logger = logging.getLogger("seatbelt.db")
from sqlalchemy.pool import NullPool

is_sqlite = settings.is_sqlite

if is_sqlite:
    engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30},
                           pool_pre_ping=True)
elif ON_VERCEL:
    # Serverless: each invocation is short-lived, so don't hold pooled connections between requests
    # (the provider's pooler, e.g. Neon/pgbouncer, does the pooling).
    engine = create_engine(settings.DATABASE_URL, poolclass=NullPool, connect_args={"connect_timeout": 10})
else:
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=5)

if is_sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):  # pragma: no cover - trivial
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema() -> None:
    """Idempotent, non-destructive schema upgrades for databases created by v1.0.

    create_all() never alters existing tables, so integrity indexes are added here.
    """
    stmts = [
        # Only one current run per seatbelt+station
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_current ON machine_runs (seatbelt_id, machine_id) WHERE is_current",
        # Run numbers are unique per seatbelt+station
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_number ON machine_runs (seatbelt_id, machine_id, run_number)",
    ]
    with engine.begin() as conn:
        for s in stmts:
            try:
                conn.execute(text(s))
            except Exception as exc:  # existing duplicate data: report, never delete
                logger.warning("Could not create integrity index (%s): %s", s.split()[5], exc)
