import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="seatbelt_tests_")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}/test.db"
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production-0123456789"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ.pop("VERCEL", None)
os.environ["DEMO_PASSWORD"] = "password123"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app, init_database  # noqa: E402
from app.db.database import Base, engine  # noqa: E402
from app.core.security import login_throttle  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    init_database()
    login_throttle.clear_all()
    yield


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


class Api:
    """Tiny helper wrapping the TestClient with per-user tokens."""

    def __init__(self, client):
        self.c = client
        self.tokens = {}

    def login(self, emp, pw="password123"):
        r = self.c.post("/api/v1/auth/login", json={"employee_id": emp, "password": pw})
        assert r.status_code == 200, r.text
        self.tokens[emp] = r.json()["access_token"]
        return r.json()

    def h(self, emp):
        if emp not in self.tokens:
            self.login(emp)
        return {"Authorization": f"Bearer {self.tokens[emp]}"}

    def get(self, url, emp="OP101", **kw):
        return self.c.get("/api/v1" + url, headers=self.h(emp), **kw)

    def post(self, url, emp="OP101", **kw):
        return self.c.post("/api/v1" + url, headers=self.h(emp), **kw)

    def put(self, url, emp="ADM001", **kw):
        return self.c.put("/api/v1" + url, headers=self.h(emp), **kw)

    def patch(self, url, emp="ADM001", **kw):
        return self.c.patch("/api/v1" + url, headers=self.h(emp), **kw)

    def scan(self, qr, emp="OP101"):
        r = self.post("/qr/scan", emp, json={"qr_code": qr})
        assert r.status_code == 200, r.text
        return r.json()

    @staticmethod
    def station(sb, code):
        return next(m for m in sb["machines_progress"] if m["machine_code"] == code)

    def run(self, sb_id, machine_id, emp="OP101", **extra):
        return self.post("/machine/run", emp, json={"seatbelt_id": sb_id, "machine_id": machine_id, **extra})


@pytest.fixture()
def api(client):
    return Api(client)
