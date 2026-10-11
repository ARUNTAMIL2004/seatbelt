from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles, client_ip, QUALITY_ROLES
from app.db.database import get_db
from app.models.models import User
from app.schemas.schemas import QualityReviewRequest, QualityReviewResponse
from app.services.quality_service import QualityService

router = APIRouter()


@router.post("/review", response_model=QualityReviewResponse)
def submit_quality_review(req: QualityReviewRequest, request: Request, db: Session = Depends(get_db),
                          current_user: User = Depends(require_roles(*QUALITY_ROLES))):
    """QA sign-off (approve / reject) of manual data entries and rework runs."""
    return QualityService.submit_review(db, req.seatbelt_id, req.machine_id, req.run_id, current_user.id,
                                        req.decision, req.comments.strip(), ip=client_ip(request))


@router.get("/pending")
def list_pending_quality_reviews(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Manual data entries and rework runs awaiting QA verification."""
    return QualityService.get_pending_reviews(db)
