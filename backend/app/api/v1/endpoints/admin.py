from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.adapters.factory import ADAPTER_REGISTRY
from app.api.deps import require_roles, client_ip
from app.core.security import get_password_hash
from app.db.database import get_db
from app.models.models import User, Machine, SystemSetting, UserRole, UserStatus
from app.schemas.schemas import UserCreate, UserUpdate, UserResponse, MachineConfigUpdate, MachineResponse
from app.services.audit_service import AuditService
from app.api.v1.endpoints.machines import machine_to_response

router = APIRouter()
admin_only = require_roles()  # ADMIN only (ADMIN is always allowed, nobody else listed)


@router.get("/users", response_model=List[UserResponse])
def list_all_users(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return db.query(User).order_by(User.employee_id.asc()).all()


@router.post("/users", response_model=UserResponse, status_code=201)
def create_user(req: UserCreate, request: Request, db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    emp = req.employee_id.strip()
    if db.query(User).filter(User.employee_id == emp).first():
        raise HTTPException(status_code=409, detail="Employee ID already exists")
    u = User(employee_id=emp, name=req.name.strip(), password_hash=get_password_hash(req.password),
             role=req.role, status=req.status, language=req.language)
    db.add(u)
    db.flush()
    AuditService.log_action(db, "USER_CREATED", user_id=admin.id,
                            new_data={"employee_id": emp, "role": req.role, "status": req.status},
                            reason=f"User {emp} created", ip_address=client_ip(request))
    db.commit()
    db.refresh(u)
    return u


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, req: UserUpdate, request: Request, db: Session = Depends(get_db),
                admin: User = Depends(admin_only)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    new_role = req.role or u.role
    new_status = req.status or u.status
    removes_admin = u.role == UserRole.ADMIN.value and u.status == UserStatus.ACTIVE.value and (
        new_role != UserRole.ADMIN.value or new_status != UserStatus.ACTIVE.value)
    if removes_admin:
        other_admins = db.query(User).filter(User.role == UserRole.ADMIN.value, User.status == UserStatus.ACTIVE.value,
                                             User.id != u.id).count()
        if other_admins == 0:
            raise HTTPException(status_code=409, detail="Cannot demote or deactivate the last active administrator")
    if u.id == admin.id and req.status == UserStatus.INACTIVE.value:
        raise HTTPException(status_code=409, detail="You cannot deactivate your own account")

    changes = {}
    for field in ("name", "role", "language", "status"):
        val = getattr(req, field)
        if val is not None and val != getattr(u, field):
            changes[field] = {"from": getattr(u, field), "to": val}
            setattr(u, field, val.strip() if isinstance(val, str) else val)
    if req.password:
        u.password_hash = get_password_hash(req.password)
        changes["password"] = "reset"
    if changes:
        AuditService.log_action(db, "USER_UPDATED", user_id=admin.id, new_data={"employee_id": u.employee_id, "changes": changes},
                                reason=f"User {u.employee_id} updated", ip_address=client_ip(request))
    db.commit()
    db.refresh(u)
    return u


@router.get("/adapter-types")
def adapter_types(_: User = Depends(admin_only)):
    return sorted(ADAPTER_REGISTRY.keys())


@router.put("/machines/{id}", response_model=MachineResponse)
def update_machine_config(id: int, req: MachineConfigUpdate, request: Request, db: Session = Depends(get_db),
                          admin: User = Depends(admin_only)):
    m = db.query(Machine).filter(Machine.id == id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    changes = {}
    if req.adapter_type is not None:
        at = req.adapter_type.upper()
        if at not in ADAPTER_REGISTRY:
            raise HTTPException(status_code=422, detail=f"Unknown adapter type. Valid: {', '.join(sorted(ADAPTER_REGISTRY))}")
        if at != m.adapter_type:
            changes["adapter_type"] = {"from": m.adapter_type, "to": at}
            m.adapter_type = at
    if req.adapter_config is not None:
        # keep existing secrets when the client echoes back the redacted placeholder
        merged = dict(req.adapter_config)
        for k, v in list(merged.items()):
            if v == "********" and m.adapter_config and k in m.adapter_config:
                merged[k] = m.adapter_config[k]
        m.adapter_config = merged
        changes["adapter_config"] = "updated"
    if req.parameters_schema is not None:
        for p in req.parameters_schema:
            if p.min_value is not None and p.max_value is not None and p.min_value > p.max_value:
                raise HTTPException(status_code=422, detail=f"'{p.name}': min_value must not exceed max_value")
        changes["parameters_schema"] = {"from": [(p.get("name"), p.get("min_value"), p.get("max_value")) for p in (m.parameters_schema or [])],
                                        "to": [(p.name, p.min_value, p.max_value) for p in req.parameters_schema]}
        m.parameters_schema = [p.model_dump(exclude_none=True) for p in req.parameters_schema]
    if changes:
        AuditService.log_action(db, "MACHINE_CONFIG_UPDATED", user_id=admin.id, machine_id=m.id,
                                new_data={"changes": changes}, reason=f"Configuration of {m.machine_code} updated",
                                ip_address=client_ip(request))
    db.commit()
    db.refresh(m)
    return machine_to_response(m)


@router.get("/settings")
def get_system_settings(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return {s.key: s.value for s in db.query(SystemSetting).all()}
