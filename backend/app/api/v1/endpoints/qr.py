from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles, client_ip, PRODUCTION_ROLES
from app.db.database import get_db
from app.models.models import User
from app.schemas.schemas import ScanQRRequest
from app.services.seatbelt_service import SeatbeltService

router = APIRouter()


@router.post("/scan")
def scan_qr_code(req: ScanQRRequest, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Scan a QR: returns seatbelt details, station progress, history, rework and missing-data info."""
    qr = req.qr_code.strip()
    seatbelt = SeatbeltService.get_by_qr_code(db, qr)
    if not seatbelt:
        raise HTTPException(status_code=404, detail=f"Seatbelt QR '{qr[:60]}' not found in the production registry.")
    return SeatbeltService.get_detailed_seatbelt_progress(db, seatbelt)


@router.post("/generate")
def generate_new_seatbelt_qr(
    request: Request,
    model: str = Query(..., min_length=1, max_length=100, description="Seatbelt model"),
    batch_number: str = Query("BATCH-2026-OCT", min_length=1, max_length=100, description="Batch number"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*PRODUCTION_ROLES)),
):
    """Register a new seatbelt with the next free serial (SB-<year>-NNNNNN)."""
    if not model.strip() or not batch_number.strip():
        raise HTTPException(status_code=422, detail="Model and batch number must not be blank")
    for _attempt in range(5):  # concurrent generators may race for the same serial
        serial = SeatbeltService.next_serial(db)
        try:
            sb = SeatbeltService.create_seatbelt(db, serial, serial, model, batch_number, current_user.id, client_ip(request))
            return SeatbeltService.get_detailed_seatbelt_progress(db, sb)
        except IntegrityError:
            db.rollback()
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
            db.rollback()
    raise HTTPException(status_code=503, detail="Could not allocate a unique serial number, please retry")
