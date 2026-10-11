from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import require_roles, MANAGEMENT_ROLES
from app.db.database import get_db
from app.models.models import User
from app.services.report_service import ReportService

router = APIRouter()


def _csv(content: str, name: str) -> Response:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")
    return Response(content=content, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}_{stamp}.csv"'})


@router.get("/export-production")
def export_production_report(db: Session = Depends(get_db), _: User = Depends(require_roles(*MANAGEMENT_ROLES))):
    return _csv(ReportService.generate_production_csv(db), "seatbelt_production_report")


@router.get("/export-rework")
def export_rework_report(db: Session = Depends(get_db), _: User = Depends(require_roles(*MANAGEMENT_ROLES))):
    return _csv(ReportService.generate_rework_csv(db), "seatbelt_rework_report")


@router.get("/export-missing-data")
def export_missing_data_report(db: Session = Depends(get_db), _: User = Depends(require_roles(*MANAGEMENT_ROLES))):
    return _csv(ReportService.generate_missing_data_csv(db), "seatbelt_missing_data_report")
