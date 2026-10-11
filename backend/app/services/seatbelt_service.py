import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Tuple

from fastapi import HTTPException
from sqlalchemy import or_, desc, func
from sqlalchemy.orm import Session, joinedload

from app.models.models import (
    Seatbelt, Machine, MachineRun, ReworkHistory, QualityReview, MachineStatus, RunType, now_utc,
)
from app.services.audit_service import AuditService

COMPLETE_STATUSES = {MachineStatus.COMPLETED.value, MachineStatus.QUALITY_APPROVED.value}
OPEN_STATES = {MachineStatus.DATA_MISSING.value, MachineStatus.READY_FOR_RERUN.value, MachineStatus.REWORK_REQUIRED.value}
QA_RUN_TYPES = {RunType.MANUAL_DATA_ENTRY.value, RunType.REWORK_RUN.value}


def needs_qa(run: MachineRun) -> bool:
    """A current run is awaiting QA verification when it is a manual entry / rework run that is
    COMPLETED but not yet reviewed (or explicitly QUALITY_PENDING)."""
    return run.status == MachineStatus.QUALITY_PENDING.value or (
        run.status == MachineStatus.COMPLETED.value and run.run_type in QA_RUN_TYPES
    )


@dataclass
class Station:
    machine: Machine
    status: str
    unlocked: bool
    current_run: Optional[MachineRun]
    runs: List[MachineRun] = field(default_factory=list)

    @property
    def completed(self) -> bool:
        return self.status in COMPLETE_STATUSES


def load_runs(db: Session, seatbelt_id: int) -> List[MachineRun]:
    return (db.query(MachineRun).options(joinedload(MachineRun.operator))
            .filter(MachineRun.seatbelt_id == seatbelt_id)
            .order_by(MachineRun.created_at.asc(), MachineRun.id.asc()).all())


def derive_stations(seatbelt: Seatbelt, machines: List[Machine], runs: List[MachineRun]) -> List[Station]:
    """Single source of truth for per-station status and lock state."""
    by_machine: Dict[int, List[MachineRun]] = {}
    for r in runs:
        by_machine.setdefault(r.machine_id, []).append(r)

    stations: List[Station] = []
    previous_complete = True
    for m in machines:
        m_runs = by_machine.get(m.id, [])
        current = next((r for r in reversed(m_runs) if r.is_current), None)
        if current:
            status = current.status
        elif seatbelt.current_machine_id == m.id and seatbelt.current_status in (
            *OPEN_STATES, MachineStatus.IN_PROGRESS.value
        ):
            status = seatbelt.current_status
        else:
            status = MachineStatus.NOT_STARTED.value
        st = Station(machine=m, status=status, unlocked=previous_complete, current_run=current, runs=m_runs)
        stations.append(st)
        previous_complete = previous_complete and st.completed
    return stations


def get_machines(db: Session) -> List[Machine]:
    return db.query(Machine).order_by(Machine.sequence_number.asc()).all()


def recompute_state(db: Session, seatbelt: Seatbelt, runs: Optional[List[MachineRun]] = None) -> List[Station]:
    """Re-derive seatbelt.current_machine_id / current_status from the run records.
    Always call after changing runs so the seatbelt can never drift from its station data."""
    machines = get_machines(db)
    if runs is None:
        db.flush()
        runs = load_runs(db, seatbelt.id)
    stations = derive_stations(seatbelt, machines, runs)
    first_open = next((s for s in stations if not s.completed), None)

    if first_open is None:
        if stations:
            seatbelt.current_machine_id = stations[-1].machine.id
        seatbelt.current_status = MachineStatus.COMPLETED.value
    else:
        seatbelt.current_machine_id = first_open.machine.id
        if first_open.current_run is None and first_open.status == MachineStatus.NOT_STARTED.value:
            seatbelt.current_status = (
                MachineStatus.IN_PROGRESS.value if runs else MachineStatus.NOT_STARTED.value
            )
        else:
            seatbelt.current_status = first_open.status
    seatbelt.updated_at = now_utc()
    db.add(seatbelt)
    return stations


def run_to_dict(r: MachineRun) -> Dict[str, Any]:
    return {
        "id": r.id, "seatbelt_id": r.seatbelt_id, "machine_id": r.machine_id, "run_number": r.run_number,
        "operator_id": r.operator_id,
        "operator_name": r.operator.name if r.operator else "Unknown",
        "operator_employee_id": r.operator.employee_id if r.operator else "N/A",
        "run_type": r.run_type, "machine_data": r.machine_data, "result": r.result, "status": r.status,
        "is_current": r.is_current, "reason": r.reason, "data_source": r.data_source,
        "started_at": r.started_at, "completed_at": r.completed_at, "created_at": r.created_at,
    }


class SeatbeltService:
    @staticmethod
    def get_by_qr_code(db: Session, qr_code: str) -> Optional[Seatbelt]:
        return db.query(Seatbelt).filter(Seatbelt.qr_code == qr_code.strip()).first()

    @staticmethod
    def get_by_id(db: Session, seatbelt_id: int) -> Optional[Seatbelt]:
        return db.query(Seatbelt).filter(Seatbelt.id == seatbelt_id).first()

    @staticmethod
    def next_serial(db: Session) -> str:
        year = now_utc().year
        prefix = f"SB-{year}-"
        highest = 0
        for (code,) in db.query(Seatbelt.qr_code).filter(Seatbelt.qr_code.like(f"{prefix}%")).all():
            m = re.fullmatch(rf"SB-{year}-(\d+)", code)
            if m:
                highest = max(highest, int(m.group(1)))
        return f"{prefix}{highest + 1:06d}"

    @staticmethod
    def create_seatbelt(db: Session, qr_code: str, seatbelt_number: Optional[str], model: str,
                        batch_number: str, user_id: Optional[int] = None, ip: Optional[str] = None) -> Seatbelt:
        qr_code = qr_code.strip()
        seatbelt_number = (seatbelt_number or qr_code).strip()
        if db.query(Seatbelt).filter(or_(Seatbelt.qr_code == qr_code, Seatbelt.seatbelt_number == seatbelt_number)).first():
            raise HTTPException(status_code=409, detail="A seatbelt with this QR code / serial number already exists")
        first_machine = db.query(Machine).order_by(Machine.sequence_number.asc()).first()
        sb = Seatbelt(
            qr_code=qr_code, seatbelt_number=seatbelt_number, model=model.strip(), batch_number=batch_number.strip(),
            current_machine_id=first_machine.id if first_machine else None,
            current_status=MachineStatus.NOT_STARTED.value,
        )
        db.add(sb)
        db.flush()
        AuditService.log_action(
            db, action="SEATBELT_CREATED", user_id=user_id, seatbelt_id=sb.id,
            new_status=MachineStatus.NOT_STARTED.value,
            new_data={"qr_code": qr_code, "model": sb.model, "batch": sb.batch_number},
            reason="Initial registration on production line", ip_address=ip,
        )
        db.commit()
        db.refresh(sb)
        return sb

    # ------------------------------------------------------------------
    @staticmethod
    def get_detailed_seatbelt_progress(db: Session, seatbelt: Seatbelt) -> Dict[str, Any]:
        machines = get_machines(db)
        runs = load_runs(db, seatbelt.id)
        reworks = (db.query(ReworkHistory).options(joinedload(ReworkHistory.rework_user))
                   .filter(ReworkHistory.seatbelt_id == seatbelt.id)
                   .order_by(ReworkHistory.created_at.asc(), ReworkHistory.id.asc()).all())
        reviews = (db.query(QualityReview).options(joinedload(QualityReview.quality_user))
                   .filter(QualityReview.seatbelt_id == seatbelt.id)
                   .order_by(QualityReview.reviewed_at.asc(), QualityReview.id.asc()).all())
        reviews_by_run: Dict[int, List[QualityReview]] = {}
        for rv in reviews:
            reviews_by_run.setdefault(rv.run_id, []).append(rv)

        stations = derive_stations(seatbelt, machines, runs)
        reworks_by_machine: Dict[int, List[ReworkHistory]] = {}
        for rw in reworks:
            reworks_by_machine.setdefault(rw.machine_id, []).append(rw)

        progress = []
        total_missing = 0
        total_qa_pending = 0
        for st in stations:
            cur = st.current_run
            awaiting_qa = bool(cur and needs_qa(cur))
            if cur and cur.run_type == RunType.MANUAL_DATA_ENTRY.value:
                total_missing += 1
            if awaiting_qa:
                total_qa_pending += 1
            progress.append({
                "machine_id": st.machine.id, "machine_code": st.machine.machine_code,
                "machine_name": st.machine.machine_name, "sequence_number": st.machine.sequence_number,
                "status": st.status,
                "is_current_machine": seatbelt.current_machine_id == st.machine.id,
                "is_unlocked": st.unlocked,
                "current_run": run_to_dict(cur) if cur else None,
                "awaiting_qa": awaiting_qa,
                "qa_reviews": [
                    {"id": rv.id, "decision": rv.decision, "comments": rv.comments,
                     "reviewer_name": rv.quality_user.name if rv.quality_user else "N/A",
                     "reviewer_employee_id": rv.quality_user.employee_id if rv.quality_user else "N/A",
                     "reviewed_at": rv.reviewed_at}
                    for rv in (reviews_by_run.get(cur.id, []) if cur else [])
                ],
                "run_count": len(st.runs),
                "history": [run_to_dict(r) for r in st.runs if not r.is_current],
                "rework_history": [
                    {"id": rw.id, "reason": rw.reason, "notes": rw.notes,
                     "rework_by_name": rw.rework_user.name if rw.rework_user else "Unknown",
                     "rework_by_emp_id": rw.rework_user.employee_id if rw.rework_user else "N/A",
                     "status": rw.status, "created_at": rw.created_at}
                    for rw in reworks_by_machine.get(st.machine.id, [])
                ],
            })

        cur_machine = next((m for m in machines if m.id == seatbelt.current_machine_id), None)
        return {
            "id": seatbelt.id, "qr_code": seatbelt.qr_code, "seatbelt_number": seatbelt.seatbelt_number,
            "model": seatbelt.model, "batch_number": seatbelt.batch_number,
            "current_machine_id": seatbelt.current_machine_id,
            "current_machine_code": cur_machine.machine_code if cur_machine else None,
            "current_machine_name": cur_machine.machine_name if cur_machine else None,
            "current_status": seatbelt.current_status,
            "created_at": seatbelt.created_at, "updated_at": seatbelt.updated_at,
            "machines_progress": progress, "total_runs": len(runs), "rework_count": len(reworks),
            "missing_data_count": total_missing, "quality_pending_count": total_qa_pending,
        }

    # ------------------------------------------------------------------
    @staticmethod
    def search_seatbelts(db: Session, query: Optional[str] = None, status: Optional[str] = None,
                         machine_id: Optional[int] = None, limit: int = 50, offset: int = 0) -> Tuple[List[Dict[str, Any]], int]:
        q = db.query(Seatbelt)
        if query and query.strip():
            term = query.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like = f"%{term}%"
            q = q.filter(or_(
                Seatbelt.qr_code.ilike(like, escape="\\"), Seatbelt.seatbelt_number.ilike(like, escape="\\"),
                Seatbelt.model.ilike(like, escape="\\"), Seatbelt.batch_number.ilike(like, escape="\\"),
            ))
        if status:
            q = q.filter(Seatbelt.current_status == status)
        if machine_id:
            q = q.filter(Seatbelt.current_machine_id == machine_id)
        total = q.count()
        rows = q.order_by(desc(Seatbelt.updated_at), desc(Seatbelt.id)).offset(offset).limit(limit).all()

        ids = [r.id for r in rows]
        run_counts = dict(db.query(MachineRun.seatbelt_id, func.count(MachineRun.id))
                          .filter(MachineRun.seatbelt_id.in_(ids)).group_by(MachineRun.seatbelt_id).all()) if ids else {}
        rw_counts = dict(db.query(ReworkHistory.seatbelt_id, func.count(ReworkHistory.id))
                         .filter(ReworkHistory.seatbelt_id.in_(ids)).group_by(ReworkHistory.seatbelt_id).all()) if ids else {}
        machines = {m.id: m for m in get_machines(db)}
        items = []
        for r in rows:
            m = machines.get(r.current_machine_id)
            items.append({
                "id": r.id, "qr_code": r.qr_code, "seatbelt_number": r.seatbelt_number, "model": r.model,
                "batch_number": r.batch_number, "current_machine_id": r.current_machine_id,
                "current_machine_code": m.machine_code if m else None,
                "current_status": r.current_status, "total_runs": run_counts.get(r.id, 0),
                "rework_count": rw_counts.get(r.id, 0), "created_at": r.created_at, "updated_at": r.updated_at,
            })
        return items, total

    # ------------------------------------------------------------------
    @staticmethod
    def build_certificate(db: Session, seatbelt: Seatbelt) -> Dict[str, Any]:
        detail = SeatbeltService.get_detailed_seatbelt_progress(db, seatbelt)
        blockers: List[str] = []
        stations = []
        signoffs: Dict[str, Dict[str, Any]] = {}
        for m in detail["machines_progress"]:
            run = m["current_run"]
            if m["status"] not in COMPLETE_STATUSES:
                blockers.append(f"{m['machine_code']} is {m['status']}")
            if m["awaiting_qa"]:
                blockers.append(f"{m['machine_code']} ({run['run_type']}) awaits QA verification")
            for rv in m["qa_reviews"]:
                if rv["decision"] == "APPROVED":
                    signoffs[rv["reviewer_employee_id"]] = {
                        "name": rv["reviewer_name"], "employee_id": rv["reviewer_employee_id"],
                        "reviewed_at": rv["reviewed_at"].isoformat(),
                    }
            stations.append({
                "machine_code": m["machine_code"], "machine_name": m["machine_name"], "status": m["status"],
                "run_id": run["id"] if run else None, "run_number": run["run_number"] if run else None,
                "run_type": run["run_type"] if run else None, "result": run["result"] if run else None,
                "operator": run["operator_name"] if run else None,
                "completed_at": run["completed_at"].isoformat() if run else None,
                "machine_data": run["machine_data"] if run else None,
                "reworks": len(m["rework_history"]),
            })
        certified = not blockers and detail["current_status"] == MachineStatus.COMPLETED.value
        canonical = json.dumps(
            {"qr": seatbelt.qr_code, "model": seatbelt.model, "batch": seatbelt.batch_number,
             "stations": stations, "qa": sorted(signoffs)},
            sort_keys=True, separators=(",", ":"), default=str,
        )
        return {
            "qr_code": seatbelt.qr_code, "model": seatbelt.model, "batch_number": seatbelt.batch_number,
            "created_at": seatbelt.created_at, "current_status": detail["current_status"],
            "certified": certified, "blockers": blockers, "stations": stations,
            "qa_signoffs": list(signoffs.values()), "rework_count": detail["rework_count"],
            "genealogy_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
            "generated_at": now_utc(),
        }
