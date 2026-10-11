from typing import Dict, Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import ReworkHistory, MachineStatus, RunResult, User
from app.services.audit_service import AuditService
from app.services.production_service import get_context, require_unlocked, commit_or_conflict
from app.services.seatbelt_service import recompute_state, derive_stations, get_machines, load_runs


class ReworkService:
    @staticmethod
    def initiate_rework(db: Session, seatbelt_id: int, machine_id: int, rework_user_id: int, reason: str,
                        notes: Optional[str] = None, ip: Optional[str] = None) -> Dict[str, Any]:
        """Archive the station's current run to history (never deleted), open a rework ticket,
        and leave the station READY_FOR_RERUN. Downstream stations stay locked."""
        seatbelt, machine, station = get_context(db, seatbelt_id, machine_id)
        code = machine.machine_code
        require_unlocked(station)

        if reason == "Other" and not (notes or "").strip():
            raise HTTPException(status_code=422, detail="Notes are required when the rework reason is 'Other'.")
        if station.status == MachineStatus.READY_FOR_RERUN.value:
            raise HTTPException(status_code=409, detail=f"{code} already has an open rework ticket. Use RUN AGAIN.")
        if station.current_run is None and station.status != MachineStatus.DATA_MISSING.value:
            raise HTTPException(status_code=409, detail=f"{code} has no recorded run to rework. Run the station instead.")

        later = [s.machine.machine_code for s in derive_stations(seatbelt, get_machines(db), load_runs(db, seatbelt.id))
                 if s.machine.sequence_number > machine.sequence_number and s.current_run is not None]
        if later:
            raise HTTPException(status_code=409, detail=(
                f"Downstream station(s) {', '.join(later)} already processed this part. "
                f"Rework the latest processed station first."))

        current = station.current_run
        old_status = station.status
        old_data = current.machine_data if current else None
        if current:
            current.is_current = False
            current.status = MachineStatus.REWORK_REQUIRED.value
            current.result = RunResult.REWORK.value

        # supersede any earlier unresolved ticket
        for t in db.query(ReworkHistory).filter(ReworkHistory.seatbelt_id == seatbelt_id,
                                                ReworkHistory.machine_id == machine_id,
                                                ReworkHistory.status == "IN_PROGRESS").all():
            t.status = "CLOSED_FAILED"

        ticket = ReworkHistory(
            seatbelt_id=seatbelt_id, machine_id=machine_id, previous_run_id=current.id if current else None,
            rework_by=rework_user_id, reason=reason, notes=(notes or "").strip() or None, status="INITIATED",
        )
        db.add(ticket)
        seatbelt.current_machine_id = machine.id
        seatbelt.current_status = MachineStatus.READY_FOR_RERUN.value
        db.flush()
        recompute_state(db, seatbelt)

        user = db.query(User).filter(User.id == rework_user_id).first()
        AuditService.log_action(
            db, action="REWORK_INITIATED", user_id=rework_user_id, seatbelt_id=seatbelt_id, machine_id=machine_id,
            old_status=old_status, new_status=MachineStatus.READY_FOR_RERUN.value, old_data=old_data,
            new_data={"rework_reason": reason, "notes": notes, "rework_id": ticket.id},
            reason=f"Rework requested by {user.name if user else 'operator'}: {reason}", ip_address=ip,
        )
        commit_or_conflict(db)
        return {
            "success": True,
            "message": f"Rework initiated for {code} ({machine.machine_name}). Previous run archived to history.",
            "seatbelt_id": seatbelt_id, "machine_id": machine_id,
            "new_run_number": (current.run_number + 1) if current else 1,
            "previous_run_id": current.id if current else None,
            "machine_status": MachineStatus.READY_FOR_RERUN.value, "rework_record_id": ticket.id,
        }
