import os
import secrets
import logging
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]  # .../backend
logger = logging.getLogger("seatbelt.config")

ON_VERCEL = bool(os.environ.get("VERCEL"))
# Vercel's deployment bundle is read-only; /tmp is the only writable (and non-persistent) location.
_DEFAULT_SQLITE = "/tmp/seatbelt_production.db" if ON_VERCEL else (BASE_DIR / "seatbelt_production.db").as_posix()
# Every Vercel deployment (preview included) is internet-reachable, so treat it as production.
_DEFAULT_ENV = "production" if ON_VERCEL else "development"
_DEMO_DEFAULT_PASSWORD = "password123"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"), env_file_encoding="utf-8", case_sensitive=True, extra="ignore"
    )

    PROJECT_NAME: str = "Seatbelt Production & Traceability System"
    VERSION: str = "1.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = _DEFAULT_ENV  # development | production | test (automatically "production" on Vercel)

    # --- Security -----------------------------------------------------
    # In production SECRET_KEY MUST be provided. In development a random key is
    # generated per process (tokens are invalidated on restart).
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12
    LOGIN_MAX_FAILURES: int = 5
    LOGIN_LOCK_SECONDS: int = 300

    # --- Database -----------------------------------------------------
    # Local dev: SQLite file. Vercel: MUST be a hosted Postgres URL (Neon / Supabase / Vercel Postgres).
    DATABASE_URL: str = f"sqlite:///{_DEFAULT_SQLITE}"

    # --- CORS (comma separated list or JSON list) ---------------------
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
    ]

    # --- Demo data ----------------------------------------------------
    SEED_DEMO_DATA: bool | None = None  # default: on in development, OFF in production
    DEMO_PASSWORD: str = _DEMO_DEFAULT_PASSWORD  # only used when seeding demo users

    # First-run administrator for production databases (created only when the users table is empty)
    BOOTSTRAP_ADMIN_EMPLOYEE_ID: str = ""
    BOOTSTRAP_ADMIN_NAME: str = "System Administrator"
    BOOTSTRAP_ADMIN_PASSWORD: str = ""

    DEFAULT_COMPANY_NAME: str = "AeroSafety Automotive Systems Ltd."
    PLANT_LOCATION: str = "Plant 02 - Singaperumalkovil Assembly Line"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _normalise_db_url(cls, v):
        """Providers hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the psycopg3 driver prefix."""
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("postgres://"):
                v = "postgresql+psycopg://" + v[len("postgres://"):]
            elif v.startswith("postgresql://"):
                v = "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str) and not v.strip().startswith("["):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def demo_enabled(self) -> bool:
        return self.SEED_DEMO_DATA if self.SEED_DEMO_DATA is not None else not self.is_production

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"


settings = Settings()

# Production: no implicit localhost origins. Same-origin (Vercel) needs no CORS; set BACKEND_CORS_ORIGINS only for a split deployment.
if settings.is_production and "BACKEND_CORS_ORIGINS" not in os.environ:
    settings.BACKEND_CORS_ORIGINS = []

if not settings.SECRET_KEY:
    if settings.is_production:
        raise RuntimeError("SECRET_KEY environment variable must be set when ENVIRONMENT=production")
    settings.SECRET_KEY = secrets.token_urlsafe(48)
    logger.warning("SECRET_KEY not set - generated an ephemeral key. Logins reset on restart. Set SECRET_KEY in backend/.env")
if settings.is_production and settings.demo_enabled:
    if settings.DEMO_PASSWORD == _DEMO_DEFAULT_PASSWORD:
        raise RuntimeError("Refusing to seed demo users with the default password in production. "
                           "Set DEMO_PASSWORD to a strong value or SEED_DEMO_DATA=false.")
    logger.warning("SEED_DEMO_DATA is enabled in production - disable it once real users exist.")
if ON_VERCEL and settings.is_sqlite:
    logger.error("DATABASE_URL is not set: using ephemeral SQLite in /tmp. DATA IS LOST on every cold start. "
                 "Set DATABASE_URL to a hosted Postgres database.")
