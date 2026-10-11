from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_roles, client_ip, PRODUCTION_ROLES
from app.db.database import get_db
from app.models.models import User
from app.schemas.schemas import ManualDataEntryRequest, ManualDataEntryResponse
from app.services.missing_data_service import MissingDataService

router = APIRouter()


@router.post("/manual-data", response_model=ManualDataEntryResponse)
def enter_manual_missing_data(req: ManualDataEntryRequest, request: Request, db: Session = Depends(get_db),
                              current_user: User = Depends(require_roles(*PRODUCTION_ROLES))):
    """Missing Machine Data workflow: the part physically ran but telemetry was lost.
    Saved as MANUAL_DATA_ENTRY, station becomes COMPLETED, next station unlocks, QA verification flagged."""
    return MissingDataService.enter_missing_data(
        db=db, seatbelt_id=req.seatbelt_id, machine_id=req.machine_id, user_id=current_user.id,
        operator_id=req.operator_id, machine_parameters=req.machine_parameters, result=req.result,
        reason=req.reason.strip(), run_at=req.run_at, run_date=req.run_date, run_time=req.run_time,
        notes=req.notes, ip=client_ip(request),
    )
