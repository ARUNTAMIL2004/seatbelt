from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.security import decode_access_token
from app.models.models import User, UserStatus, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

PRODUCTION_ROLES = (UserRole.PRODUCTION.value, UserRole.SUPERVISOR.value, UserRole.ADMIN.value)
QUALITY_ROLES = (UserRole.QUALITY.value, UserRole.ADMIN.value)
MANAGEMENT_ROLES = (UserRole.SUPERVISOR.value, UserRole.QUALITY.value, UserRole.ADMIN.value)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated or session expired",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise unauthorized
    payload = decode_access_token(token)
    emp_id = payload.get("sub") if payload else None
    if not emp_id:
        raise unauthorized
    user = db.query(User).filter(User.employee_id == emp_id, User.status == UserStatus.ACTIVE.value).first()
    if not user:
        raise unauthorized
    return user


def require_roles(*allowed_roles: str):
    """Dependency factory. ADMIN is always allowed."""

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != UserRole.ADMIN.value and current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: your role ({current_user.role}) cannot perform this action",
            )
        return current_user

    return role_checker
