from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import User, UserStatus, MachineStatus, RunType, RunResult, now_utc
from app.services.audit_service import AuditService
from app.services.production_service import (
    get_context, require_unlocked, validate_values, record_run, open_rework_ticket,
    commit_or_conflict, unlocked_next_code,
)
from app.services.seatbelt_service import recompute_state


def _resolve_timestamp(run_at: Optional[datetime], run_date: Optional[str], run_time: Optional[str]) -> datetime:
    if run_at is not None:
        ts = run_at if run_at.tzinfo else run_at.replace(tzinfo=timezone.utc)
        return ts.astimezone(timezone.utc)
    if run_date:
        try:
            return datetime.strptime(f"{run_date} {run_time or '00:00'}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=422, detail="run_date must be YYYY-MM-DD and run_time HH:MM")
    return now_utc()


class MissingDataService:
    ALLOWED = {MachineStatus.NOT_STARTED.value, MachineStatus.IN_PROGRESS.value,
               MachineStatus.DATA_MISSING.value, MachineStatus.READY_FOR_RERUN.value}

    @staticmethod
    def enter_missing_data(
        db: Session, seatbelt_id: int, machine_id: int, user_id: int, operator_id: Optional[int],
        machine_parameters: Dict[str, Any], result: str, reason: str,
        run_at: Optional[datetime] = None, run_date: Optional[str] = None, run_time: Optional[str] = None,
        notes: Optional[str] = None, ip: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Record physically-verified values for a station whose telemetry was lost.
        No physical re-run is needed. Saved as MANUAL_DATA_ENTRY and flagged for QA verification."""
        seatbelt, machine, station = get_context(db, seatbelt_id, machine_id)
        require_unlocked(station)
        if station.current_run is not None or station.status not in MissingDataService.ALLOWED:
            raise HTTPException(status_code=409, detail=(
                f"{machine.machine_code} already has a recorded run ({station.status}). "
                f"Use REWORK to correct a recorded station."))

        eff_operator_id = operator_id or user_id
        op = db.query(User).filter(User.id == eff_operator_id, User.status == UserStatus.ACTIVE.value).first()
        if not op:
            raise HTTPException(status_code=422, detail="Selected operator does not exist or is inactive")
        entry_user = db.query(User).filter(User.id == user_id).first()

        ts = _resolve_timestamp(run_at, run_date, run_time)
        if ts > now_utc() + timedelta(minutes=5):
            raise HTTPException(status_code=422, detail="Run date/time cannot be in the future")
        if ts < seatbelt.created_at - timedelta(minutes=1):
            raise HTTPException(status_code=422, detail="Run date/time is earlier than the seatbelt's registration time")

        validate_values(machine, machine_parameters, result)

        old_status = station.status
        run = record_run(
            db, seatbelt, machine, eff_operator_id, RunType.MANUAL_DATA_ENTRY.value, machine_parameters,
            result, "MANUAL_DATA_ENTRY", reason, started_at=ts, completed_at=ts,
        )
        ticket = open_rework_ticket(db, seatbelt_id, machine_id)
        passed = result == RunResult.PASS.value
        if ticket:
            ticket.new_run_id = run.id
            ticket.status = "RESOLVED" if passed else "IN_PROGRESS"

        recompute_state(db, seatbelt)
        AuditService.log_action(
            db, action="MANUAL_DATA_ENTRY", user_id=user_id, seatbelt_id=seatbelt_id, machine_id=machine_id,
            old_status=old_status, new_status=run.status, old_data={"status": old_status},
            new_data={"run_id": run.id, "run_type": RunType.MANUAL_DATA_ENTRY.value, "operator_id": eff_operator_id,
                      "entered_by": entry_user.name if entry_user else "N/A", "parameters": machine_parameters,
                      "result": result, "reason": reason, "notes": notes, "run_at": ts.isoformat()},
            reason=f"Missing data entry: {reason}", ip_address=ip,
        )
        commit_or_conflict(db)
        nxt_code = unlocked_next_code(db, machine, passed)
        nxt = None
        if nxt_code:
            from app.models.models import Machine
            nxt = db.query(Machine).filter(Machine.machine_code == nxt_code).first()
        return {
            "success": True,
            "message": f"Missing data for {machine.machine_code} ({machine.machine_name}) recorded as MANUAL_DATA_ENTRY.",
            "seatbelt_id": seatbelt_id, "machine_id": machine_id, "run_id": run.id,
            "machine_status": run.status, "unlocked_next_machine_id": nxt.id if nxt else None,
        }
