from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query, Body
from sqlalchemy.orm import Session, joinedload

from app.adapters.base import BaseMachineAdapter, AdapterError
from app.adapters.factory import get_machine_adapter
from app.api.deps import get_current_user, require_roles, client_ip, PRODUCTION_ROLES
from app.db.database import get_db
from app.models.models import Machine, MachineRun, User
from app.schemas.schemas import MachineResponse, RunStationRequest, FlagMissingRequest
from app.services.production_service import ProductionService
from app.services.seatbelt_service import run_to_dict

router = APIRouter()


def machine_to_response(m: Machine) -> dict:
    """Serialise a machine with adapter secrets (api keys, passwords...) redacted."""
    return {
        "id": m.id, "machine_code": m.machine_code, "machine_name": m.machine_name,
        "sequence_number": m.sequence_number, "status": m.status, "description": m.description,
        "parameters_schema": m.parameters_schema, "adapter_type": m.adapter_type,
        "adapter_config": BaseMachineAdapter.redact_config(m.adapter_config), "created_at": m.created_at,
    }


@router.get("", response_model=List[MachineResponse])
def get_all_machines(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [machine_to_response(m) for m in db.query(Machine).order_by(Machine.sequence_number.asc()).all()]


@router.get("/{id}/runs")
def get_machine_runs(id: int, seatbelt_id: Optional[int] = None, limit: int = Query(100, ge=1, le=500),
                     db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not db.query(Machine.id).filter(Machine.id == id).first():
        raise HTTPException(status_code=404, detail="Machine not found")
    q = db.query(MachineRun).options(joinedload(MachineRun.operator)).filter(MachineRun.machine_id == id)
    if seatbelt_id:
        q = q.filter(MachineRun.seatbelt_id == seatbelt_id)
    return [run_to_dict(r) for r in q.order_by(MachineRun.created_at.desc(), MachineRun.id.desc()).limit(limit).all()]


@router.post("/{id}/test-adapter")
def test_machine_adapter(id: int, db: Session = Depends(get_db), _: User = Depends(require_roles("SUPERVISOR"))):
    machine = db.query(Machine).filter(Machine.id == id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    try:
        adapter = get_machine_adapter(machine.machine_code, machine.adapter_type, machine.adapter_config, machine.parameters_schema)
        result = adapter.test_connection()
    except (AdapterError, ValueError) as exc:
        result = {"connected": False, "status": "ERROR", "message": str(exc)}
    return {"machine_id": machine.id, "machine_code": machine.machine_code, "machine_name": machine.machine_name,
            "adapter_type": machine.adapter_type, "test_result": result}


@router.post("/{id}/simulate-cycle")
def simulate_cycle(id: int, seatbelt_qr: str = Body(..., embed=True, max_length=200),
                   simulate_failure: bool = Body(False, embed=True),
                   db: Session = Depends(get_db), current_user: User = Depends(require_roles(*PRODUCTION_ROLES))):
    """Dry-run of a station cycle (nothing is stored). Use POST /machine/run to record a run."""
    machine = db.query(Machine).filter(Machine.id == id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    from app.services.production_service import adapter_cycle
    return adapter_cycle(machine, seatbelt_qr, current_user.id, simulate_failure)


@router.post("/run")
def run_station(req: RunStationRequest, request: Request, db: Session = Depends(get_db),
                current_user: User = Depends(require_roles(*PRODUCTION_ROLES))):
    """Execute and record the first run of a station (enforces strict station sequence)."""
    return ProductionService.run_station(db, req.seatbelt_id, req.machine_id, current_user.id,
                                         params=req.machine_parameters, result=req.result, ip=client_ip(request))


@router.post("/flag-missing")
def flag_missing(req: FlagMissingRequest, request: Request, db: Session = Depends(get_db),
                 current_user: User = Depends(require_roles(*PRODUCTION_ROLES))):
    """Mark a station as DATA_MISSING (part ran, telemetry lost) pending manual data entry."""
    return ProductionService.flag_missing(db, req.seatbelt_id, req.machine_id, current_user.id, req.notes, client_ip(request))
