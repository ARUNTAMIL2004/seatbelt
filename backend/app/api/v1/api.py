from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    qr,
    seatbelts,
    machines,
    rework,
    missing_data,
    quality,
    dashboard,
    audit,
    reports,
    admin
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(qr.router, prefix="/qr", tags=["QR Code"])
api_router.include_router(seatbelts.router, prefix="/seatbelt", tags=["Seatbelts"])
api_router.include_router(machines.router, prefix="/machine", tags=["Machines"])
api_router.include_router(rework.router, prefix="/rework", tags=["Rework"])
api_router.include_router(missing_data.router, prefix="/machine", tags=["Missing Data"])
api_router.include_router(quality.router, prefix="/quality", tags=["Quality"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(audit.router, prefix="/audit", tags=["Audit"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
