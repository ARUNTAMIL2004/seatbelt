from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles, MANAGEMENT_ROLES
from app.db.database import get_db
from app.models.models import User
from app.services.audit_service import AuditService, audit_to_dict
from app.services.seatbelt_service import SeatbeltService

router = APIRouter()


@router.get("/logs")
def get_all_audit_logs(limit: int = Query(200, ge=1, le=1000), offset: int = Query(0, ge=0),
                       action: Optional[str] = Query(None, max_length=100),
                       db: Session = Depends(get_db), _: User = Depends(require_roles(*MANAGEMENT_ROLES))):
    rows, total = AuditService.get_all_logs(db, limit=limit, offset=offset, action=action)
    return {"items": [audit_to_dict(l) for l in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/{seatbelt_id}")
def get_seatbelt_audit_trail(seatbelt_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not SeatbeltService.get_by_id(db, seatbelt_id):
        raise HTTPException(status_code=404, detail="Seatbelt not found")
    return [audit_to_dict(l, include_ip=False) for l in AuditService.get_logs_for_seatbelt(db, seatbelt_id)]
