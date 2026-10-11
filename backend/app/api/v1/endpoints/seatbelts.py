from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles, client_ip, PRODUCTION_ROLES
from app.db.database import get_db
from app.models.models import User
from app.schemas.schemas import SeatbeltCreate
from app.services.seatbelt_service import SeatbeltService

router = APIRouter()


@router.get("/search")
def search_seatbelts(q: Optional[str] = Query(None, max_length=100), status: Optional[str] = Query(None, max_length=50),
                     machine_id: Optional[int] = None, limit: int = Query(25, ge=1, le=100),
                     offset: int = Query(0, ge=0), db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    items, total = SeatbeltService.search_seatbelts(db, query=q, status=status, machine_id=machine_id, limit=limit, offset=offset)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def _get_or_404(db: Session, id: int):
    sb = SeatbeltService.get_by_id(db, id)
    if not sb:
        raise HTTPException(status_code=404, detail="Seatbelt not found")
    return sb


@router.get("/{id}")
def get_seatbelt_by_id(id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return SeatbeltService.get_detailed_seatbelt_progress(db, _get_or_404(db, id))


@router.get("/{id}/machines")
def get_seatbelt_machines(id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return SeatbeltService.get_detailed_seatbelt_progress(db, _get_or_404(db, id))["machines_progress"]


@router.get("/{id}/certificate")
def get_seatbelt_certificate(id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Genealogy certificate data with a SHA-256 over the canonical genealogy record."""
    return SeatbeltService.build_certificate(db, _get_or_404(db, id))


@router.post("/create")
def create_seatbelt(data: SeatbeltCreate, request: Request, db: Session = Depends(get_db),
                    current_user: User = Depends(require_roles(*PRODUCTION_ROLES))):
    sb = SeatbeltService.create_seatbelt(db, data.qr_code, data.seatbelt_number, data.model, data.batch_number,
                                         current_user.id, client_ip(request))
    return SeatbeltService.get_detailed_seatbelt_progress(db, sb)
