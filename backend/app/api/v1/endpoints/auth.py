from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles, client_ip
from app.core.security import (
    verify_password, create_access_token, get_password_hash, needs_rehash, burn_password_check, login_throttle,
)
from app.db.database import get_db
from app.models.models import User, UserStatus
from app.schemas.schemas import LoginRequest, TokenResponse, UserPublic, OperatorItem, UserResponse, _check_password
from app.services.audit_service import AuditService

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    emp = req.employee_id.strip()
    wait = login_throttle.retry_after(emp, ip)
    if wait:
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {wait} seconds.",
                            headers={"Retry-After": str(wait)})

    user = db.query(User).filter(User.employee_id == emp).first()
    valid = bool(user) and verify_password(req.password, user.password_hash)
    if not user:
        burn_password_check(req.password)
    if not valid:
        login_throttle.record_failure(emp, ip)
        AuditService.log_action(db, "LOGIN_FAILED", user_id=user.id if user else None,
                                new_data={"employee_id": emp[:50]}, reason="Invalid employee ID or password", ip_address=ip)
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid employee ID or password")
    if user.status != UserStatus.ACTIVE.value:
        raise HTTPException(status_code=403, detail="User account is inactive")

    login_throttle.reset(emp, ip)
    if needs_rehash(user.password_hash):  # upgrade legacy SHA-256 hashes transparently
        user.password_hash = get_password_hash(req.password)
    AuditService.log_action(db, "LOGIN_SUCCESS", user_id=user.id, reason="User signed in", ip_address=ip)
    db.commit()

    token = create_access_token({"sub": user.employee_id, "role": user.role})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserPublic)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/operators", response_model=List[OperatorItem])
def list_operators(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Minimal active-user directory used by operator pickers."""
    return db.query(User).filter(User.status == UserStatus.ACTIVE.value).order_by(User.employee_id.asc()).all()


@router.get("/users", response_model=List[UserResponse])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_roles("SUPERVISOR"))):
    return db.query(User).order_by(User.employee_id.asc()).all()


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v):
        return _check_password(v)


@router.post("/change-password")
def change_password(req: ChangePasswordRequest, request: Request, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if req.current_password == req.new_password:
        raise HTTPException(status_code=422, detail="New password must differ from the current password")
    current_user.password_hash = get_password_hash(req.new_password)
    AuditService.log_action(db, "PASSWORD_CHANGED", user_id=current_user.id, reason="User changed own password",
                            ip_address=client_ip(request))
    db.commit()
    return {"success": True, "message": "Password updated"}
