import pytest


def codes(sb):
    return {m["machine_code"]: m for m in sb["machines_progress"]}


def mid(sb, code):
    return codes(sb)[code]["machine_id"]


# ---------------------------------------------------------------- station sequence
def test_full_line_runs_in_strict_order(api):
    sb = api.scan("SB-2026-000127")  # fresh
    assert sb["current_status"] == "NOT_STARTED"
    assert [m["is_unlocked"] for m in sb["machines_progress"]] == [True] + [False] * 5

    # out-of-order is rejected
    r = api.run(sb["id"], mid(sb, "M2"))
    assert r.status_code == 409 and "locked" in r.json()["detail"].lower()

    for i, code in enumerate(["M1", "M2", "M3", "M4", "M5", "M6"]):
        r = api.run(sb["id"], mid(sb, code))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["result"] == "PASS" and body["machine_status"] == "COMPLETED"
        cur = api.scan("SB-2026-000127")
        if code != "M6":
            assert cur["current_machine_code"] == f"M{i + 2}" and cur["current_status"] == "IN_PROGRESS"
    assert cur["current_status"] == "COMPLETED"

    # duplicate run of a completed station is rejected (no silent overwrite)
    assert api.run(sb["id"], mid(sb, "M1")).status_code == 409
    assert api.scan("SB-2026-000127")["total_runs"] == 6


def test_run_data_is_within_tolerance_and_schema_complete(api):
    sb = api.scan("SB-2026-000127")
    api.run(sb["id"], mid(sb, "M1"))
    st = codes(api.scan("SB-2026-000127"))["M1"]
    machines = {m["machine_code"]: m for m in api.get("/machine").json()}
    for p in machines["M1"]["parameters_schema"]:
        v = st["current_run"]["machine_data"][p["name"]]
        assert p["min_value"] <= v <= p["max_value"]
    assert st["current_run"]["run_type"] == "MACHINE_RUN" and st["current_run"]["data_source"]


# ---------------------------------------------------------------- failure + rework
def test_failed_run_blocks_downstream_then_rework_and_rerun(api):
    sb = api.scan("SB-2026-000127")
    api.run(sb["id"], mid(sb, "M1"))
    r = api.run(sb["id"], mid(sb, "M2"), result="FAIL")
    assert r.status_code == 200 and r.json()["result"] == "FAIL" and r.json()["machine_status"] == "REWORK_REQUIRED"
    cur = api.scan("SB-2026-000127")
    assert cur["current_status"] == "REWORK_REQUIRED" and not codes(cur)["M3"]["is_unlocked"]

    # cannot just run / rerun again without opening a rework ticket
    assert api.run(sb["id"], mid(sb, "M2")).status_code == 409
    assert api.post("/rework/rerun", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M2")}).status_code == 409
    # cannot jump ahead
    assert api.run(sb["id"], mid(sb, "M3")).status_code == 409

    # rework requires valid reason; 'Other' requires notes
    bad = api.post("/rework", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M2"), "reason": "Because"})
    assert bad.status_code == 422
    other = api.post("/rework", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M2"), "reason": "Other"})
    assert other.status_code == 422

    rw = api.post("/rework", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M2"), "reason": "Machine error", "notes": "spring replaced"})
    assert rw.status_code == 200 and rw.json()["machine_status"] == "READY_FOR_RERUN"
    cur = api.scan("SB-2026-000127")
    m2 = codes(cur)["M2"]
    assert m2["status"] == "READY_FOR_RERUN" and m2["current_run"] is None and len(m2["history"]) == 1
    assert m2["history"][0]["result"] == "REWORK" and not codes(cur)["M3"]["is_unlocked"]
    # double rework click is rejected
    assert api.post("/rework", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M2"), "reason": "Machine error"}).status_code == 409
    # plain 'run' is refused while a ticket is open
    assert api.run(sb["id"], mid(sb, "M2")).status_code == 409

    rr = api.post("/rework/rerun", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M2")})
    assert rr.status_code == 200 and rr.json()["run_number"] == 2 and rr.json()["unlocked_next_machine_code"] == "M3"
    cur = api.scan("SB-2026-000127")
    m2 = codes(cur)["M2"]
    assert m2["current_run"]["run_number"] == 2 and m2["current_run"]["run_type"] == "REWORK_RUN" and m2["current_run"]["is_current"]
    assert len(m2["history"]) == 1 and m2["rework_history"][0]["status"] == "RESOLVED"
    assert codes(cur)["M3"]["is_unlocked"] and cur["current_machine_code"] == "M3"


def test_seeded_rework_flow(api):
    sb = api.scan("SB-2026-000124")
    m5 = codes(sb)["M5"]
    assert m5["status"] == "REWORK_REQUIRED" and not codes(sb)["M6"]["is_unlocked"]
    assert api.post("/rework", json={"seatbelt_id": sb["id"], "machine_id": m5["machine_id"], "reason": "Parameter error"}).status_code == 200
    assert api.post("/rework/rerun", json={"seatbelt_id": sb["id"], "machine_id": m5["machine_id"]}).status_code == 200
    sb = api.scan("SB-2026-000124")
    assert codes(sb)["M5"]["current_run"]["run_number"] == 2 and codes(sb)["M6"]["is_unlocked"]


def test_cannot_rework_when_downstream_already_processed(api):
    sb = api.scan("SB-2026-000125")  # completed
    r = api.post("/rework", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M2"), "reason": "Quality issue"})
    assert r.status_code == 409 and "Downstream" in r.json()["detail"]
    # latest station can be reworked and the belt reopens
    r = api.post("/rework", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M6"), "reason": "Quality issue"})
    assert r.status_code == 200
    assert api.scan("SB-2026-000125")["current_status"] == "READY_FOR_RERUN"
    api.post("/rework/rerun", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M6")})
    assert api.scan("SB-2026-000125")["current_status"] == "COMPLETED"


def test_rework_on_never_run_station_rejected(api):
    sb = api.scan("SB-2026-000127")
    r = api.post("/rework", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M1"), "reason": "Part not run"})
    assert r.status_code == 409


# ---------------------------------------------------------------- missing data
GOOD_M5 = {"torsion_yield_torque": 181.5, "load_limiter_threshold": 3.86, "sensor_voltage": 4.97, "calibration_result": "PASS"}


def test_missing_data_recovery_flow(api):
    sb = api.scan("SB-2026-000123")
    m5 = codes(sb)["M5"]
    assert m5["status"] == "DATA_MISSING" and not codes(sb)["M6"]["is_unlocked"]
    payload = {"seatbelt_id": sb["id"], "machine_id": m5["machine_id"], "operator_id": 1, "result": "PASS",
               "reason": "Part physically completed, machine data not recorded."}

    # PASS with out-of-tolerance value is refused
    bad = dict(GOOD_M5, torsion_yield_torque=250)
    r = api.post("/machine/manual-data", json={**payload, "machine_parameters": bad})
    assert r.status_code == 422 and "exceeds" in r.json()["detail"]
    # missing / unknown parameter refused
    assert api.post("/machine/manual-data", json={**payload, "machine_parameters": {"sensor_voltage": 5.0}}).status_code == 422
    assert api.post("/machine/manual-data", json={**payload, "machine_parameters": {**GOOD_M5, "bogus": 1}}).status_code == 422
    # future timestamp refused
    assert api.post("/machine/manual-data", json={**payload, "machine_parameters": GOOD_M5, "run_at": "2099-01-01T10:00:00Z"}).status_code == 422
    # unknown operator refused
    assert api.post("/machine/manual-data", json={**payload, "machine_parameters": GOOD_M5, "operator_id": 9999}).status_code == 422
    assert api.scan("SB-2026-000123")["total_runs"] == 4  # nothing was stored by failed attempts

    r = api.post("/machine/manual-data", json={**payload, "machine_parameters": GOOD_M5})
    assert r.status_code == 200, r.text
    sb = api.scan("SB-2026-000123")
    m5 = codes(sb)["M5"]
    assert m5["status"] == "COMPLETED" and m5["current_run"]["run_type"] == "MANUAL_DATA_ENTRY"
    assert m5["current_run"]["data_source"] == "MANUAL_DATA_ENTRY" and m5["awaiting_qa"]
    assert codes(sb)["M6"]["is_unlocked"] and sb["current_machine_code"] == "M6"
    # second manual entry over a recorded station is refused (must use rework)
    assert api.post("/machine/manual-data", json={**payload, "machine_parameters": GOOD_M5}).status_code == 409
    # appears in QA queue
    pending = api.get("/quality/pending", "QA201").json()
    assert any(p["seatbelt_qr"] == "SB-2026-000123" and p["machine_code"] == "M5" for p in pending)


def test_manual_fail_result_records_out_of_tolerance_part(api):
    sb = api.scan("SB-2026-000123")
    m5 = codes(sb)["M5"]
    bad = dict(GOOD_M5, torsion_yield_torque=250)
    r = api.post("/machine/manual-data", json={"seatbelt_id": sb["id"], "machine_id": m5["machine_id"], "result": "FAIL",
                                               "reason": "Part measured out of tolerance", "machine_parameters": bad})
    assert r.status_code == 200 and r.json()["machine_status"] == "REWORK_REQUIRED"
    assert not codes(api.scan("SB-2026-000123"))["M6"]["is_unlocked"]


def test_flag_missing_then_manual_entry(api):
    sb = api.scan("SB-2026-000126")  # at M3
    m3 = codes(sb)["M3"]
    assert api.post("/machine/flag-missing", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M4")}).status_code == 409  # locked
    r = api.post("/machine/flag-missing", json={"seatbelt_id": sb["id"], "machine_id": m3["machine_id"]})
    assert r.status_code == 200
    sb = api.scan("SB-2026-000126")
    assert sb["current_status"] == "DATA_MISSING" and codes(sb)["M3"]["status"] == "DATA_MISSING"
    good = {"squib_resistance": 2.1, "crimp_pressure": 14.8, "insertion_depth": 42.5, "leak_test_pressure": 5.0}
    assert api.post("/machine/manual-data", json={"seatbelt_id": sb["id"], "machine_id": m3["machine_id"], "machine_parameters": good,
                                                  "reason": "Offline fixture used"}).status_code == 200
    assert codes(api.scan("SB-2026-000126"))["M4"]["is_unlocked"]


def test_manual_entry_requires_unlocked_station(api):
    sb = api.scan("SB-2026-000127")
    r = api.post("/machine/manual-data", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M3"), "machine_parameters": {},
                                               "reason": "trying to skip"})
    assert r.status_code == 409


# ---------------------------------------------------------------- quality
def _enter_manual(api, emp="OP101"):
    sb = api.scan("SB-2026-000123")
    m5 = codes(sb)["M5"]
    r = api.post("/machine/manual-data", emp, json={"seatbelt_id": sb["id"], "machine_id": m5["machine_id"], "machine_parameters": GOOD_M5,
                                                    "reason": "Part physically completed, machine data not recorded."})
    assert r.status_code == 200
    return api.scan("SB-2026-000123"), codes(api.scan("SB-2026-000123"))["M5"]


def test_quality_approval_flow_and_certificate(api):
    sb, m5 = _enter_manual(api)
    review = {"seatbelt_id": sb["id"], "machine_id": m5["machine_id"], "run_id": m5["current_run"]["id"]}
    assert api.post("/quality/review", "OP101", json={**review, "decision": "APPROVED", "comments": "ok ok"}).status_code == 403
    assert api.post("/quality/review", "QA201", json={**review, "decision": "APPROVED", "comments": ""}).status_code == 422
    assert api.post("/quality/review", "QA201", json={**review, "decision": "MAYBE", "comments": "ok ok"}).status_code == 422
    r = api.post("/quality/review", "QA201", json={**review, "decision": "APPROVED", "comments": "Verified against gauge CG-408"})
    assert r.status_code == 200 and r.json()["machine_status"] == "QUALITY_APPROVED"
    sb = api.scan("SB-2026-000123")
    m5 = codes(sb)["M5"]
    assert m5["status"] == "QUALITY_APPROVED" and not m5["awaiting_qa"] and codes(sb)["M6"]["is_unlocked"]
    assert m5["qa_reviews"][0]["reviewer_employee_id"] == "QA201"
    # cannot review twice
    assert api.post("/quality/review", "QA201", json={**review, "decision": "REJECTED", "comments": "changed my mind"}).status_code == 409
    # leaves the queue
    assert not any(p["run_id"] == review["run_id"] for p in api.get("/quality/pending", "QA201").json())

    # certificate: draft until the belt is finished
    cert = api.get("/seatbelt/%d/certificate" % sb["id"]).json()
    assert cert["certified"] is False and any("M6" in b for b in cert["blockers"])
    api.run(sb["id"], mid(sb, "M6"))
    cert = api.get("/seatbelt/%d/certificate" % sb["id"]).json()
    assert cert["certified"] is True and cert["qa_signoffs"][0]["employee_id"] == "QA201" and len(cert["genealogy_sha256"]) == 64
    assert cert["genealogy_sha256"] == api.get("/seatbelt/%d/certificate" % sb["id"]).json()["genealogy_sha256"]


def test_quality_rejection_blocks_and_requires_rework(api):
    sb, m5 = _enter_manual(api)
    review = {"seatbelt_id": sb["id"], "machine_id": m5["machine_id"], "run_id": m5["current_run"]["id"]}
    r = api.post("/quality/review", "QA201", json={**review, "decision": "REJECTED", "comments": "Values not credible"})
    assert r.status_code == 200
    sb = api.scan("SB-2026-000123")
    assert sb["current_status"] == "QUALITY_REJECTED" and not codes(sb)["M6"]["is_unlocked"]
    assert api.run(sb["id"], mid(sb, "M6")).status_code == 409
    assert api.post("/rework", json={"seatbelt_id": sb["id"], "machine_id": m5["machine_id"], "reason": "Quality issue"}).status_code == 200
    assert api.post("/rework/rerun", json={"seatbelt_id": sb["id"], "machine_id": m5["machine_id"]}).status_code == 200
    assert codes(api.scan("SB-2026-000123"))["M6"]["is_unlocked"]


def test_segregation_of_duties(api):
    sb = api.scan("SB-2026-000123")
    m5 = codes(sb)["M5"]
    api.post("/machine/manual-data", "ADM001", json={"seatbelt_id": sb["id"], "machine_id": m5["machine_id"], "machine_parameters": GOOD_M5,
                                                     "operator_id": 5, "reason": "Admin recovered data"})
    run_id = codes(api.scan("SB-2026-000123"))["M5"]["current_run"]["id"]
    r = api.post("/quality/review", "ADM001", json={"seatbelt_id": sb["id"], "machine_id": m5["machine_id"], "run_id": run_id,
                                                    "decision": "APPROVED", "comments": "self approve"})
    assert r.status_code == 403


def test_review_of_wrong_run_or_machine_rejected(api):
    sb = api.scan("SB-2026-000125")
    m1 = codes(sb)["M1"]
    # normal completed machine run needs no QA, but is "COMPLETED" so is reviewable only if awaiting; wrong ids -> 404
    r = api.post("/quality/review", "QA201", json={"seatbelt_id": sb["id"], "machine_id": mid(sb, "M2"), "run_id": m1["current_run"]["id"],
                                                   "decision": "APPROVED", "comments": "mismatch"})
    assert r.status_code == 404


# ---------------------------------------------------------------- adapters & admin
def test_adapter_switch_and_stub_behaviour(api):
    machines = {m["machine_code"]: m for m in api.get("/machine").json()}
    m1 = machines["M1"]
    r = api.put(f"/admin/machines/{m1['id']}", json={"adapter_type": "REST_API", "adapter_config": {"endpoint_url": "http://x", "api_key": "S3CRET"}})
    assert r.status_code == 200 and r.json()["adapter_config"]["api_key"] == "********"
    assert "S3CRET" not in api.get("/machine").text
    sb = api.scan("SB-2026-000127")
    r = api.run(sb["id"], m1["id"])
    assert r.status_code == 501 and api.scan("SB-2026-000127")["total_runs"] == 0  # nothing fake recorded
    t = api.post(f"/machine/{m1['id']}/test-adapter", "SUP301").json()["test_result"]
    assert t["connected"] is False
    assert api.put(f"/admin/machines/{m1['id']}", json={"adapter_type": "BOGUS"}).status_code == 422


def test_tolerance_edit_changes_validation_and_simulation(api):
    machines = {m["machine_code"]: m for m in api.get("/machine").json()}
    m1 = machines["M1"]
    schema = m1["parameters_schema"]
    schema[0]["min_value"], schema[0]["max_value"], schema[0]["nominal"] = 3000.0, 3010.0, 3005.0
    assert api.put(f"/admin/machines/{m1['id']}", json={"parameters_schema": schema}).status_code == 200
    sb = api.scan("SB-2026-000127")
    assert api.run(sb["id"], m1["id"]).status_code == 200
    val = codes(api.scan("SB-2026-000127"))["M1"]["current_run"]["machine_data"][schema[0]["name"]]
    assert 3000.0 <= val <= 3010.0
    schema[0]["min_value"] = 5000.0
    assert api.put(f"/admin/machines/{m1['id']}", json={"parameters_schema": schema}).status_code == 422  # min > max


def test_admin_user_management(api):
    r = api.post("/admin/users", "ADM001", json={"employee_id": "OP200", "name": "New Op", "role": "PRODUCTION", "password": "Sup3rSecret!"})
    assert r.status_code == 201 and "password" not in r.text
    assert api.post("/admin/users", "ADM001", json={"employee_id": "OP200", "name": "Dup", "role": "PRODUCTION", "password": "Sup3rSecret!"}).status_code == 409
    assert api.post("/admin/users", "ADM001", json={"employee_id": "OP201", "name": "Weak", "role": "PRODUCTION", "password": "123"}).status_code == 422
    assert api.post("/admin/users", "ADM001", json={"employee_id": "OP202", "name": "Bad", "role": "ROOT", "password": "Sup3rSecret!"}).status_code == 422
    assert api.post("/admin/users", "OP101", json={"employee_id": "OP203", "name": "X", "role": "ADMIN", "password": "Sup3rSecret!"}).status_code == 403
    api.login("OP200", "Sup3rSecret!")
    # last admin protection
    assert api.patch("/admin/users/5", json={"role": "PRODUCTION"}).status_code == 409
    assert api.patch("/admin/users/5", json={"status": "INACTIVE"}).status_code == 409
    # password reset
    assert api.patch(f"/admin/users/{r.json()['id']}", json={"password": "AnotherPass99"}).status_code == 200
    api.login("OP200", "AnotherPass99")
    logs = api.get("/audit/logs", "ADM001").json()["items"]
    assert any(l["action"] == "USER_CREATED" for l in logs) and any(l["action"] == "USER_UPDATED" for l in logs)


# ---------------------------------------------------------------- search, qr, dashboard, reports, audit
def test_generate_qr_sequence_and_uniqueness(api):
    a = api.post("/qr/generate", params={"model": "Test Model", "batch_number": "B1"}).json()
    b = api.post("/qr/generate", params={"model": "Test Model", "batch_number": "B1"}).json()
    assert a["qr_code"] == "SB-2026-000129" and b["qr_code"] == "SB-2026-000130"
    assert api.post("/qr/generate", params={"model": "  ", "batch_number": "B1"}).status_code == 422
    assert api.post("/seatbelt/create", json={"qr_code": a["qr_code"], "model": "m", "batch_number": "b"}).status_code == 409


def test_scan_unknown_and_blank(api):
    assert api.post("/qr/scan", json={"qr_code": "NOPE"}).status_code == 404
    assert api.post("/qr/scan", json={"qr_code": ""}).status_code == 422
    assert api.post("/qr/scan", json={"qr_code": "  SB-2026-000125  "}).status_code == 200


def test_search_pagination_filters_and_wildcards(api):
    r = api.get("/seatbelt/search", params={"limit": 2, "offset": 0}).json()
    assert r["total"] == 6 and len(r["items"]) == 2
    r2 = api.get("/seatbelt/search", params={"limit": 2, "offset": 4}).json()
    assert len(r2["items"]) == 2 and {i["id"] for i in r["items"]}.isdisjoint({i["id"] for i in r2["items"]})
    assert api.get("/seatbelt/search", params={"q": "000124"}).json()["total"] == 1
    assert api.get("/seatbelt/search", params={"status": "COMPLETED"}).json()["total"] == 1
    assert api.get("/seatbelt/search", params={"q": "%"}).json()["total"] == 0  # wildcard escaped
    assert api.get("/seatbelt/search", params={"limit": 1000}).status_code == 422
    assert api.get("/seatbelt/search", params={"q": "zzz-no-match"}).json()["items"] == []


def test_dashboard_numbers_are_real_and_consistent(api):
    d = api.get("/dashboard/stats").json()
    k = d["kpi_summary"]
    assert k["total_production"] == 6 and k["completed"] == 1 and k["rework_required"] == 1
    assert k["in_progress"] == 6 - 1 - 1 - 0 and k["data_missing"] == 1 and k["quality_pending"] == 1
    assert 0 <= k["first_pass_yield"] <= 100
    for m in d["machine_throughput"]:
        assert m["total_processed"] == m["pass_count"] + m["rework_count"] + m["missing_data_count"]
    # empty-data honesty: no fabricated placeholder numbers
    sb = api.scan("SB-2026-000127")
    assert sb["total_runs"] == 0
    assert api.get("/dashboard/stats").json()["kpi_summary"]["total_production"] == 6


def test_dashboard_with_no_runs_has_no_fake_numbers(api):
    from app.db.database import SessionLocal
    from app.models.models import MachineRun, ReworkHistory, QualityReview, AuditLog, Seatbelt
    with SessionLocal() as db:
        db.query(AuditLog).delete(); db.query(QualityReview).delete(); db.query(ReworkHistory).delete(); db.query(MachineRun).delete()
        db.query(Seatbelt).delete(); db.commit()
    k = api.get("/dashboard/stats").json()
    assert k["kpi_summary"]["total_production"] == 0 and k["kpi_summary"]["first_pass_yield"] is None
    assert all(m["total_processed"] == 0 and m["avg_cycle_time_sec"] is None for m in k["machine_throughput"])


def test_csv_reports_and_formula_injection(api):
    sb = api.post("/seatbelt/create", json={"qr_code": "SB-INJ-1", "model": "=HYPERLINK(\"http://evil\")", "batch_number": "B"}).json()
    api.run(sb["id"], sb["machines_progress"][0]["machine_id"])
    r = api.get("/reports/export-production", "SUP301")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    assert "'=HYPERLINK" in r.text and ",=HYPERLINK" not in r.text
    assert api.get("/reports/export-rework", "SUP301").status_code == 200
    assert api.get("/reports/export-missing-data", "QA201").text.count("\n") >= 2


def test_audit_trail_is_atomic_complete_and_immutable(api):
    sb = api.scan("SB-2026-000127")
    api.run(sb["id"], mid(sb, "M1"))
    trail = api.get(f"/audit/{sb['id']}").json()
    assert {t["action"] for t in trail} >= {"MACHINE_RUN_COMPLETED"}
    from app.db.database import SessionLocal
    from app.models.models import AuditLog
    with SessionLocal() as db:
        row = db.query(AuditLog).first()
        row.reason = "tampered"
        with pytest.raises(ValueError):
            db.flush()
        db.rollback()
        db.delete(db.query(AuditLog).first())
        with pytest.raises(ValueError):
            db.flush()
        db.rollback()
    logs = api.get("/audit/logs", "SUP301").json()
    assert logs["total"] >= 1 and logs["items"][0]["ip_address"]


def test_validation_errors_do_not_500(api):
    assert api.post("/machine/run", json={"seatbelt_id": 999, "machine_id": 1}).status_code == 404
    assert api.post("/machine/run", json={"seatbelt_id": 1, "machine_id": 999}).status_code == 404
    assert api.post("/machine/run", json={"seatbelt_id": "x"}).status_code == 422
    assert api.post("/machine/manual-data", json={"seatbelt_id": 1, "machine_id": 1, "machine_parameters": {"a": float("inf") if False else {"nested": 1}},
                                                  "reason": "abc"}).status_code == 422
    assert api.get("/seatbelt/9999").status_code == 404
    assert api.get("/audit/9999").status_code == 404
    assert api.get("/machine/999/runs").status_code == 404
    assert api.get("/machine/1/runs").status_code == 200
    assert api.get("/rework/history", params={"limit": 0}).status_code == 422


def test_health_and_cors(client):
    assert client.get("/health").json()["status"] == "ok"
    r = client.options("/api/v1/auth/login", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
    r = client.options("/api/v1/auth/login", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers
