from typing import Optional
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_roles, client_ip, PRODUCTION_ROLES
from app.db.database import get_db
from app.models.models import User, ReworkHistory
from app.schemas.schemas import ReworkInitiateRequest, ReworkResponse, RerunExecuteRequest
from app.services.production_service import ProductionService
from app.services.rework_service import ReworkService

router = APIRouter()


@router.post("", response_model=ReworkResponse)
def initiate_rework(req: ReworkInitiateRequest, request: Request, db: Session = Depends(get_db),
                    current_user: User = Depends(require_roles(*PRODUCTION_ROLES))):
    """Rework step 1: archive current run to history, open ticket, station -> READY_FOR_RERUN, downstream stays locked."""
    return ReworkService.initiate_rework(db, req.seatbelt_id, req.machine_id, current_user.id, req.reason,
                                         req.notes, ip=client_ip(request))


@router.post("/rerun")
def execute_rerun(req: RerunExecuteRequest, request: Request, db: Session = Depends(get_db),
                  current_user: User = Depends(require_roles(*PRODUCTION_ROLES))):
    """Rework step 2: record the re-run as the CURRENT run (REWORK_RUN). PASS unlocks the next station."""
    return ProductionService.rerun_station(db, req.seatbelt_id, req.machine_id, current_user.id,
                                           params=req.machine_parameters, result=req.result, ip=client_ip(request))


@router.get("/history")
def get_rework_history(seatbelt_id: Optional[int] = None, machine_id: Optional[int] = None,
                       limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db),
                       _: User = Depends(get_current_user)):
    q = db.query(ReworkHistory).options(joinedload(ReworkHistory.seatbelt), joinedload(ReworkHistory.machine),
                                        joinedload(ReworkHistory.rework_user))
    if seatbelt_id:
        q = q.filter(ReworkHistory.seatbelt_id == seatbelt_id)
    if machine_id:
        q = q.filter(ReworkHistory.machine_id == machine_id)
    return [{
        "id": r.id, "seatbelt_id": r.seatbelt_id, "seatbelt_qr": r.seatbelt.qr_code if r.seatbelt else "N/A",
        "seatbelt_model": r.seatbelt.model if r.seatbelt else "N/A", "machine_id": r.machine_id,
        "machine_code": r.machine.machine_code if r.machine else "N/A",
        "machine_name": r.machine.machine_name if r.machine else "N/A",
        "previous_run_id": r.previous_run_id, "new_run_id": r.new_run_id,
        "rework_by_name": r.rework_user.name if r.rework_user else "Unknown",
        "rework_by_emp_id": r.rework_user.employee_id if r.rework_user else "N/A",
        "reason": r.reason, "notes": r.notes, "status": r.status, "created_at": r.created_at,
    } for r in q.order_by(ReworkHistory.created_at.desc(), ReworkHistory.id.desc()).limit(limit).all()]
