# Seatbelt Production & Traceability System

React/Vite single-page app (`frontend/`) + FastAPI API (`backend/`) deployed together on **Vercel**
(static build + one Python serverless function) with a hosted **PostgreSQL** database.

```
.
├── api/index.py          # Vercel serverless entrypoint (exports the FastAPI `app`)
├── backend/              # FastAPI app, services, adapters, tests
│   └── app/{api,core,db,models,schemas,services,adapters}
├── frontend/             # React + Vite + Tailwind SPA
├── requirements.txt      # Python runtime deps used by Vercel
├── package.json          # root scripts (Vercel detects Node version from here)
├── vercel.json           # build, output dir, function and rewrite config
└── .env.example          # every environment variable
```

## Deploy to Vercel

1. **Create a PostgreSQL database** (Vercel Storage → Neon, or Supabase/any Postgres) and copy its connection string.
2. Push this folder to a Git repo and **Import** it in Vercel (Root Directory = repo root). `vercel.json` already sets:
   - Install: `npm ci --prefix frontend`
   - Build: `npm run build --prefix frontend`
   - Output: `frontend/dist`
   - Python function `api/index.py` (deps from root `requirements.txt`, Python 3.12) and rewrites `/api/*` → function, everything else → SPA.
3. In **Settings → Environment Variables** add (Production *and* Preview):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | your Postgres URL (`postgres://…?sslmode=require`) |
   | `SECRET_KEY` | long random string: `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
   | `BOOTSTRAP_ADMIN_EMPLOYEE_ID` | e.g. `ADM001` |
   | `BOOTSTRAP_ADMIN_PASSWORD` | a strong initial password (first run only) |

   Optional: `BACKEND_CORS_ORIGINS` (only for a split deployment), `ACCESS_TOKEN_EXPIRE_MINUTES`, `PLANT_LOCATION`, `VITE_STATION_NAME`.
4. **Deploy.** Tables and the six machine stations are created automatically on the first request.
5. Open the site, sign in with the bootstrap admin, then create users under **Admin → Users & Roles** and change your password (key icon).
6. Verify: `https://<your-app>.vercel.app/health` → `{"status":"ok","database":"ok","persistent":true}`; API docs at `/docs`.

> Without `DATABASE_URL` the API falls back to an ephemeral SQLite file in `/tmp` and **loses data**; `/health` shows `"persistent": false`.
> Demo data (`SEED_DEMO_DATA=true` + a strong `DEMO_PASSWORD`, optionally `VITE_DEMO_MODE=true`) is for evaluation only.
> Login throttling is held in memory per serverless instance (best-effort); put Vercel Firewall rate limiting in front for stricter protection.

## Local development

```bash
# backend (Python 3.12)
cd backend && python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env            # optional; dev works with defaults (SQLite file + demo users, password: password123)
python run.py                   # http://localhost:8000  (docs at /docs)

# frontend
cd frontend && npm install && npm run dev                          # http://localhost:5173
```

Demo logins (dev only): `OP101`/`OP102` (production), `QA201` (quality), `SUP301` (supervisor), `ADM001` (admin) — password `password123` (`DEMO_PASSWORD`).

## Tests

```bash
cd backend && python -m pytest tests -q                                   # 36 API tests (SQLite)
TEST_DATABASE_URL=postgresql://... python -m pytest tests -q              # same suite on PostgreSQL
cd frontend && npm test                                                    # unit/component tests
TEST_API_BASE=http://127.0.0.1:8001/api/v1 npm test                        # + UI end-to-end vs a live API
```

## Business rules enforced by the API
Strict station order M1→M6 (server-side locks) · failed run ⇒ rework required · rework archives (never deletes) the run and
re-run is the only way forward · manual data entry must be within tolerance (or recorded as FAIL) and is queued for QA · QA cannot sign
off their own work · every change writes an immutable audit record in the same transaction.
