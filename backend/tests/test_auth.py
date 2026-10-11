import hashlib
from app.db.database import SessionLocal
from app.models.models import User


def test_all_endpoints_require_authentication(client):
    for method, url in [
        ("get", "/api/v1/machine"), ("get", "/api/v1/dashboard/stats"), ("get", "/api/v1/seatbelt/search"),
        ("get", "/api/v1/audit/logs"), ("get", "/api/v1/auth/users"), ("get", "/api/v1/auth/operators"),
        ("get", "/api/v1/quality/pending"), ("get", "/api/v1/reports/export-production"),
        ("get", "/api/v1/admin/users"), ("post", "/api/v1/qr/scan"), ("post", "/api/v1/machine/run"),
        ("post", "/api/v1/rework"), ("post", "/api/v1/machine/manual-data"), ("post", "/api/v1/quality/review"),
    ]:
        r = getattr(client, method)(url)
        assert r.status_code == 401, (url, r.status_code)


def test_login_success_and_me(api):
    data = api.login("OP101")
    assert data["user"]["role"] == "PRODUCTION" and "password_hash" not in data["user"]
    assert api.get("/auth/me").json()["employee_id"] == "OP101"


def test_wrong_password_and_no_backdoor(api, client):
    r = client.post("/api/v1/auth/login", json={"employee_id": "OP101", "password": "nope"})
    assert r.status_code == 401
    # change a password: the old hard-coded 'password123' bypass must not work anymore
    api.post("/auth/change-password", "OP102", json={"current_password": "password123", "new_password": "NewStrongPass1"})
    r = client.post("/api/v1/auth/login", json={"employee_id": "OP102", "password": "password123"})
    assert r.status_code == 401
    r = client.post("/api/v1/auth/login", json={"employee_id": "OP102", "password": "NewStrongPass1"})
    assert r.status_code == 200


def test_unknown_user_same_error(client):
    r = client.post("/api/v1/auth/login", json={"employee_id": "GHOST", "password": "x"})
    assert r.status_code == 401 and r.json()["detail"] == "Invalid employee ID or password"


def test_bruteforce_lockout(client):
    for _ in range(5):
        assert client.post("/api/v1/auth/login", json={"employee_id": "OP101", "password": "bad"}).status_code == 401
    r = client.post("/api/v1/auth/login", json={"employee_id": "OP101", "password": "password123"})
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_invalid_and_tampered_token(client):
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer abc.def.ghi"}).status_code == 401


def test_legacy_sha256_hash_is_upgraded_on_login(api, client):
    salt = "ab" * 16
    legacy = f"{salt}${hashlib.sha256((salt + 'password123').encode()).hexdigest()}"
    with SessionLocal() as db:
        u = db.query(User).filter(User.employee_id == "OP101").first()
        u.password_hash = legacy
        db.commit()
    assert client.post("/api/v1/auth/login", json={"employee_id": "OP101", "password": "password123"}).status_code == 200
    with SessionLocal() as db:
        assert db.query(User).filter(User.employee_id == "OP101").first().password_hash.startswith("$2")


def test_inactive_user_cannot_login_or_use_token(api, client):
    tok = api.h("OP102")
    api.patch("/admin/users/2", json={"status": "INACTIVE"})
    assert client.get("/api/v1/auth/me", headers=tok).status_code == 401
    assert client.post("/api/v1/auth/login", json={"employee_id": "OP102", "password": "password123"}).status_code == 403


def test_timestamps_have_timezone(api):
    sb = api.scan("SB-2026-000125")
    assert sb["created_at"].endswith("Z") or "+00:00" in sb["created_at"]


def test_rbac(api):
    assert api.get("/admin/users", "OP101").status_code == 403
    assert api.get("/auth/users", "OP101").status_code == 403
    assert api.get("/reports/export-production", "OP101").status_code == 403
    assert api.get("/audit/logs", "OP101").status_code == 403
    assert api.get("/audit/logs", "SUP301").status_code == 200
    assert api.get("/reports/export-production", "QA201").status_code == 200
    assert api.post("/machine/1/test-adapter", "OP101").status_code == 403
    assert api.post("/machine/1/test-adapter", "SUP301").status_code == 200
    sb = api.scan("SB-2026-000127")
    assert api.run(sb["id"], sb["machines_progress"][0]["machine_id"], "QA201").status_code == 403
    assert api.put("/admin/machines/1", "SUP301", json={}).status_code == 403
