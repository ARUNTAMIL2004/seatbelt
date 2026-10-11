from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.models.models import User
from app.schemas.schemas import DashboardResponse
from app.services.analytics_service import AnalyticsService

router = APIRouter()


@router.get("/stats", response_model=DashboardResponse)
def get_dashboard_statistics(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Live KPI summary, station throughput, rework Pareto, manual-entry stats and activity feed."""
    return AnalyticsService.get_dashboard_data(db)
