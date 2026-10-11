from typing import Dict, Any, List

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.models import MachineRun, QualityReview, MachineStatus, QualityDecision, User, QualityReview as QR
from app.services.audit_service import AuditService
from app.services.production_service import get_context, commit_or_conflict
from app.services.seatbelt_service import recompute_state, needs_qa, QA_RUN_TYPES


class QualityService:
    @staticmethod
    def submit_review(db: Session, seatbelt_id: int, machine_id: int, run_id: int, quality_user_id: int,
                      decision: str, comments: str, ip: str = None) -> Dict[str, Any]:
        seatbelt, machine, station = get_context(db, seatbelt_id, machine_id)
        run = db.query(MachineRun).filter(MachineRun.id == run_id).first()
        if not run or run.seatbelt_id != seatbelt_id or run.machine_id != machine_id:
            raise HTTPException(status_code=404, detail="Machine run not found for this seatbelt/station")
        if not run.is_current or station.current_run is None or station.current_run.id != run.id:
            raise HTTPException(status_code=409, detail="Only the current run of a station can be reviewed (this run is archived).")
        if run.status not in (MachineStatus.COMPLETED.value, MachineStatus.QUALITY_PENDING.value):
            raise HTTPException(status_code=409, detail=f"Run is {run.status}; only completed runs awaiting verification can be reviewed.")
        if run.operator_id == quality_user_id:
            raise HTTPException(status_code=403, detail="Segregation of duties: you cannot sign off a run you performed.")

        decision = decision.upper()
        is_approved = decision == QualityDecision.APPROVED.value
        old_status = run.status
        new_status = MachineStatus.QUALITY_APPROVED.value if is_approved else MachineStatus.QUALITY_REJECTED.value

        db.add(QualityReview(seatbelt_id=seatbelt_id, machine_id=machine_id, run_id=run_id,
                             quality_user_id=quality_user_id, decision=decision, comments=comments))
        run.status = new_status
        recompute_state(db, seatbelt)

        qa_user = db.query(User).filter(User.id == quality_user_id).first()
        AuditService.log_action(
            db, action="QUALITY_APPROVAL" if is_approved else "QUALITY_REJECTION", user_id=quality_user_id,
            seatbelt_id=seatbelt_id, machine_id=machine_id, old_status=old_status, new_status=new_status,
            old_data={"run_id": run_id, "previous_status": old_status},
            new_data={"decision": decision, "comments": comments, "qa_officer": qa_user.name if qa_user else "QA"},
            reason=f"Quality Sign-off: {decision} - {comments}", ip_address=ip,
        )
        commit_or_conflict(db)
        return {
            "success": True, "message": f"Quality review recorded for {machine.machine_code}: {decision}",
            "seatbelt_id": seatbelt_id, "machine_id": machine_id, "decision": decision, "machine_status": new_status,
        }

    @staticmethod
    def get_pending_reviews(db: Session) -> List[Dict[str, Any]]:
        runs = (db.query(MachineRun).options(joinedload(MachineRun.seatbelt), joinedload(MachineRun.machine),
                                              joinedload(MachineRun.operator))
                .filter(MachineRun.is_current == True,  # noqa: E712
                        MachineRun.status.in_([MachineStatus.QUALITY_PENDING.value, MachineStatus.COMPLETED.value]))
                .order_by(MachineRun.created_at.asc()).all())
        return [{
            "run_id": r.id, "seatbelt_id": r.seatbelt_id, "seatbelt_qr": r.seatbelt.qr_code,
            "seatbelt_model": r.seatbelt.model, "machine_id": r.machine_id, "machine_code": r.machine.machine_code,
            "machine_name": r.machine.machine_name, "run_number": r.run_number, "run_type": r.run_type,
            "operator_id": r.operator_id, "operator_name": r.operator.name if r.operator else "N/A",
            "machine_data": r.machine_data, "result": r.result, "reason": r.reason, "created_at": r.created_at,
        } for r in runs if needs_qa(r)]
