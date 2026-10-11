import io
import csv
import json
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.models.models import MachineRun, ReworkHistory

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: Any) -> Any:
    """Neutralise CSV/Excel formula injection (OWASP): prefix risky text with an apostrophe."""
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def _write(rows, header) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(header)
    for r in rows:
        w.writerow([safe_cell(c) for c in r])
    return "\ufeff" + out.getvalue()  # BOM so Excel opens UTF-8 (Tamil names) correctly


def _ts(dt) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S") + " UTC" if dt else ""


class ReportService:
    @staticmethod
    def generate_production_csv(db: Session) -> str:
        runs = (db.query(MachineRun).options(joinedload(MachineRun.seatbelt), joinedload(MachineRun.machine), joinedload(MachineRun.operator))
                .order_by(MachineRun.created_at.desc(), MachineRun.id.desc()).all())
        header = ["Run ID", "Seatbelt QR", "Model", "Machine Code", "Machine Name", "Run #", "Run Type", "Current Run",
                  "Operator ID", "Operator Name", "Result", "Status", "Data Source", "Completed (UTC)", "Parameters", "Reason/Notes"]
        rows = [[r.id, r.seatbelt.qr_code, r.seatbelt.model, r.machine.machine_code, r.machine.machine_name, r.run_number,
                 r.run_type, "YES" if r.is_current else "NO", r.operator.employee_id if r.operator else "N/A",
                 r.operator.name if r.operator else "N/A", r.result, r.status, r.data_source, _ts(r.completed_at),
                 json.dumps(r.machine_data, ensure_ascii=False), r.reason or ""] for r in runs]
        return _write(rows, header)

    @staticmethod
    def generate_rework_csv(db: Session) -> str:
        reworks = (db.query(ReworkHistory).options(joinedload(ReworkHistory.seatbelt), joinedload(ReworkHistory.machine), joinedload(ReworkHistory.rework_user))
                   .order_by(ReworkHistory.created_at.desc(), ReworkHistory.id.desc()).all())
        header = ["Rework ID", "Seatbelt QR", "Machine Code", "Rework Reason", "Notes", "Initiated By", "Status",
                  "Date Initiated (UTC)", "Previous Run ID", "New Run ID"]
        rows = [[rw.id, rw.seatbelt.qr_code, rw.machine.machine_code, rw.reason, rw.notes or "",
                 rw.rework_user.name if rw.rework_user else "N/A", rw.status, _ts(rw.created_at),
                 rw.previous_run_id or "", rw.new_run_id or "PENDING"] for rw in reworks]
        return _write(rows, header)

    @staticmethod
    def generate_missing_data_csv(db: Session) -> str:
        runs = (db.query(MachineRun).options(joinedload(MachineRun.seatbelt), joinedload(MachineRun.machine), joinedload(MachineRun.operator))
                .filter(MachineRun.run_type == "MANUAL_DATA_ENTRY")
                .order_by(MachineRun.created_at.desc(), MachineRun.id.desc()).all())
        header = ["Run ID", "Seatbelt QR", "Machine Code", "Operator ID", "Operator Name", "Parameters Recorded", "Result",
                  "Reason Given", "Process Time (UTC)", "Entered At (UTC)", "Current Run"]
        rows = [[r.id, r.seatbelt.qr_code, r.machine.machine_code, r.operator.employee_id if r.operator else "N/A",
                 r.operator.name if r.operator else "N/A", json.dumps(r.machine_data, ensure_ascii=False), r.result,
                 r.reason or "", _ts(r.completed_at), _ts(r.created_at), "YES" if r.is_current else "NO"] for r in runs]
        return _write(rows, header)
