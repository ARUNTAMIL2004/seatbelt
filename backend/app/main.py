import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.config import settings, ON_VERCEL
from app.db.database import engine, Base, SessionLocal, ensure_schema
from app.models import models  # noqa: F401  (register tables)
from app.api.v1.api import api_router
from app.services.seed_service import seed_database

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("seatbelt")


_init_lock = threading.Lock()
_initialised = False


def init_database() -> None:
    """Create tables, apply integrity indexes, seed reference/demo data. Idempotent and safe to run
    concurrently from several cold-started serverless instances."""
    global _initialised
    with _init_lock:
        Base.metadata.create_all(bind=engine)
        ensure_schema()
        with SessionLocal() as db:
            try:
                seed_database(db)
            except IntegrityError:  # another instance seeded at the same moment
                db.rollback()
        _initialised = True


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        init_database()
    except Exception:  # serverless: do not crash the worker; the first request retries
        logger.exception("Database initialisation failed at startup; will retry on first request")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Industrial Seatbelt Production Tracking, Machine Data Management, Rework and Missing Data Management API",
    openapi_url="/api/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Bearer-token auth (no cookies) => credentials are not needed; origins are an explicit allow-list.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(api_router, prefix="/api", include_in_schema=False)  # short alias


@app.middleware("http")
async def ensure_database_ready(request: Request, call_next):
    """Serverless runtimes may not run lifespan events, so initialise lazily on the first request."""
    if not _initialised and request.url.path not in ("/health",):
        try:
            await run_in_threadpool(init_database)
        except Exception:
            logger.exception("Database initialisation failed")
            return JSONResponse(status_code=503, content={"detail": "Database unavailable. Check DATABASE_URL."})
    return await call_next(request)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/")
def root():
    return {"status": "ONLINE", "system": settings.PROJECT_NAME, "version": settings.VERSION,
            "plant": settings.PLANT_LOCATION, "docs": "/docs"}


@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok", "persistent": not (ON_VERCEL and settings.is_sqlite)}
    except Exception:
        return JSONResponse(status_code=503, content={"status": "degraded", "database": "unreachable"})
