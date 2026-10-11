"""Vercel serverless entrypoint.

Vercel's Python runtime serves the ASGI object named `app` from this file. All /api/* requests are
rewritten here by vercel.json, and FastAPI performs its own routing on the original request path.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402,F401  (re-exported for the Vercel runtime)
