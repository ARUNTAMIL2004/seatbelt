"""Shared station workflow engine: guards + run recording used by run / rerun / manual entry."""
from datetime import timedelta
from typing import Dict, Any, Optional, Tuple, List

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.adapters.base import BaseMachineAdapter, AdapterError, AdapterNotImplementedError
from app.adapters.factory import get_machine_adapter
from app.models.models import (
    Seatbelt, Machine, MachineRun, ReworkHistory, MachineStatus, RunType, RunResult, now_utc,
)
from app.services.audit_service import AuditService
from app.services.seatbelt_service import (
    Station, derive_stations, get_machines, load_runs, recompute_state,
)


def get_context(db: Session, seatbelt_id: int, machine_id: int) -> Tuple[Seatbelt, Machine, Station]:
    seatbelt = db.query(Seatbelt).filter(Seatbelt.id == seatbelt_id).first()
    if not seatbelt:
        raise HTTPException(status_code=404, detail="Seatbelt not found")
    machines = get_machines(db)
    machine = next((m for m in machines if m.id == machine_id), None)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    stations = derive_stations(seatbelt, machines, load_runs(db, seatbelt.id))
    station = next(s for s in stations if s.machine.id == machine_id)
    return seatbelt, machine, station


def require_unlocked(station: Station, stations_hint: str = "") -> None:
    if not station.unlocked:
        raise HTTPException(
            status_code=409,
            detail=f"Station {station.machine.machine_code} is locked: complete the previous station(s) first.",
        )


def next_run_number(db: Session, seatbelt_id: int, machine_id: int) -> int:
    current_max = db.query(func.max(MachineRun.run_number)).filter(
        MachineRun.seatbelt_id == seatbelt_id, MachineRun.machine_id == machine_id
    ).scalar()
    return (current_max or 0) + 1


def open_rework_ticket(db: Session, seatbelt_id: int, machine_id: int) -> Optional[ReworkHistory]:
    return (db.query(ReworkHistory)
            .filter(ReworkHistory.seatbelt_id == seatbelt_id, ReworkHistory.machine_id == machine_id,
                    ReworkHistory.status == "INITIATED")
            .order_by(ReworkHistory.created_at.desc(), ReworkHistory.id.desc()).first())


def validate_values(machine: Machine, params: Dict[str, Any], result: str) -> None:
    """PASS requires every parameter present and within tolerance. FAIL only needs well-formed data."""
    ok, errors = BaseMachineAdapter.validate_parameters(
        params, machine.parameters_schema, reject_unknown=True, check_limits=(result == RunResult.PASS.value)
    )
    if not ok:
        hint = " Select result FAIL to record an out-of-tolerance part." if result == RunResult.PASS.value else ""
        raise HTTPException(status_code=422, detail="; ".join(errors) + "." + hint if hint else "; ".join(errors))


def adapter_cycle(machine: Machine, seatbelt_qr: str, operator_id: int, simulate_failure: bool) -> Dict[str, Any]:
    try:
        adapter = get_machine_adapter(machine.machine_code, machine.adapter_type, machine.adapter_config,
                                      machine.parameters_schema)
        cycle = adapter.trigger_machine_cycle(seatbelt_qr, operator_id, simulate_failure=simulate_failure)
    except AdapterNotImplementedError as exc:
        raise HTTPException(status_code=501, detail=f"{exc}. Switch the station to SIMULATOR or use manual data entry.")
    except (AdapterError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Machine adapter error: {exc}")
    if not isinstance(cycle.get("data"), dict) or not cycle["data"]:
        raise HTTPException(status_code=502, detail="Machine adapter returned no process data; nothing was recorded.")
    return cycle


def record_run(
    db: Session, seatbelt: Seatbelt, machine: Machine, operator_id: int, run_type: str,
    params: Dict[str, Any], result: str, data_source: str, reason: Optional[str],
    started_at=None, completed_at=None,
) -> MachineRun:
    """Create the new CURRENT run (archiving any stale current run defensively)."""
    for r in db.query(MachineRun).filter(MachineRun.seatbelt_id == seatbelt.id, MachineRun.machine_id == machine.id,
                                         MachineRun.is_current == True).all():  # noqa: E712
        r.is_current = False
    db.flush()
    completed = completed_at or now_utc()
    run = MachineRun(
        seatbelt_id=seatbelt.id, machine_id=machine.id, operator_id=operator_id,
        run_number=next_run_number(db, seatbelt.id, machine.id), run_type=run_type,
        machine_data=params, result=result,
        status=MachineStatus.COMPLETED.value if result == RunResult.PASS.value else MachineStatus.REWORK_REQUIRED.value,
        is_current=True, reason=reason, data_source=data_source,
        started_at=started_at or completed, completed_at=completed,
    )
    db.add(run)
    db.flush()
    return run


def commit_or_conflict(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflicting update detected (another operator changed this station). Reload and retry.")


def unlocked_next_code(db: Session, machine: Machine, passed: bool) -> Optional[str]:
    if not passed:
        return None
    nxt = db.query(Machine).filter(Machine.sequence_number > machine.sequence_number).order_by(Machine.sequence_number.asc()).first()
    return nxt.machine_code if nxt else None


class ProductionService:
    START_STATES = {MachineStatus.NOT_STARTED.value, MachineStatus.IN_PROGRESS.value, MachineStatus.DATA_MISSING.value}

    @staticmethod
    def _execute(db: Session, seatbelt_id: int, machine_id: int, operator_id: int, params: Optional[Dict[str, Any]],
                 requested_result: Optional[str], rerun: bool, ip: Optional[str]) -> Dict[str, Any]:
        seatbelt, machine, station = get_context(db, seatbelt_id, machine_id)
        require_unlocked(station)
        code = machine.machine_code

        if rerun:
            if station.status != MachineStatus.READY_FOR_RERUN.value:
                raise HTTPException(status_code=409, detail=(
                    f"{code} is {station.status}. Re-run is only available after rework has been initiated "
                    f"(status READY_FOR_RERUN)."))
        else:
            if station.current_run is not None:
                raise HTTPException(status_code=409, detail=(
                    f"{code} already has a recorded run (#{station.current_run.run_number}, {station.status}). "
                    + ("Initiate rework to run it again." if station.status != MachineStatus.COMPLETED.value
                       else "Initiate rework if it must be repeated.")))
            if station.status == MachineStatus.READY_FOR_RERUN.value:
                raise HTTPException(status_code=409, detail=f"{code} is awaiting a rework re-run. Use RUN AGAIN.")
            if station.status not in ProductionService.START_STATES:
                raise HTTPException(status_code=409, detail=f"{code} cannot be run while {station.status}.")

        old_status = station.status
        started_at = completed_at = None
        if params is not None:  # externally supplied results (e.g. gateway push)
            ok, _ = BaseMachineAdapter.validate_parameters(params, machine.parameters_schema)
            result = RunResult.PASS.value if (ok and requested_result != RunResult.FAIL.value) else RunResult.FAIL.value
            validate_values(machine, params, result)  # FAIL: structure only; PASS: full tolerance check
            data_source, final_params = "API_SUBMITTED", params
        else:
            simulate_failure = requested_result == RunResult.FAIL.value and machine.adapter_type.upper() == "SIMULATOR"
            cycle = adapter_cycle(machine, seatbelt.qr_code, operator_id, simulate_failure)
            final_params = cycle["data"]
            ok, _ = BaseMachineAdapter.validate_parameters(final_params, machine.parameters_schema, reject_unknown=False)
            result = RunResult.PASS.value if (ok and cycle.get("result", "PASS") == "PASS") else RunResult.FAIL.value
            data_source = cycle.get("data_source", "ADAPTER")
            completed_at = now_utc()
            started_at = completed_at - timedelta(seconds=float(cycle.get("cycle_time_sec") or 0))

        run = record_run(
            db, seatbelt, machine, operator_id,
            RunType.REWORK_RUN.value if rerun else RunType.MACHINE_RUN.value,
            final_params, result, data_source,
            reason=None, started_at=started_at, completed_at=completed_at,
        )
        passed = result == RunResult.PASS.value

        if rerun:
            run.reason = f"Rework re-run #{run.run_number}"
            ticket = open_rework_ticket(db, seatbelt_id, machine_id)
            if ticket:
                ticket.new_run_id = run.id
                ticket.status = "RESOLVED" if passed else "IN_PROGRESS"
        else:
            run.reason = None if passed else "Out-of-tolerance result recorded by station cycle"

        stations = recompute_state(db, seatbelt)
        AuditService.log_action(
            db, action="RERUN_COMPLETED" if rerun else "MACHINE_RUN_COMPLETED", user_id=operator_id,
            seatbelt_id=seatbelt_id, machine_id=machine_id, old_status=old_status, new_status=run.status,
            new_data={"run_id": run.id, "run_number": run.run_number, "run_type": run.run_type,
                      "result": result, "parameters": final_params},
            reason=f"{'Rework cycle' if rerun else 'Station cycle'} #{run.run_number} executed with result: {result}",
            ip_address=ip,
        )
        commit_or_conflict(db)
        return {
            "success": True,
            "message": f"Run #{run.run_number} saved for {code}. Result: {result}",
            "seatbelt_id": seatbelt_id, "machine_id": machine_id, "run_id": run.id,
            "run_number": run.run_number, "result": result, "machine_status": run.status,
            "seatbelt_status": seatbelt.current_status,
            "unlocked_next_machine_code": unlocked_next_code(db, machine, passed),
        }

    @staticmethod
    def run_station(db, seatbelt_id, machine_id, operator_id, params=None, result=None, ip=None):
        return ProductionService._execute(db, seatbelt_id, machine_id, operator_id, params, result, False, ip)

    @staticmethod
    def rerun_station(db, seatbelt_id, machine_id, operator_id, params=None, result=None, ip=None):
        return ProductionService._execute(db, seatbelt_id, machine_id, operator_id, params, result, True, ip)

    @staticmethod
    def flag_missing(db: Session, seatbelt_id: int, machine_id: int, user_id: int,
                     notes: Optional[str], ip: Optional[str]) -> Dict[str, Any]:
        """Operator reports that the part ran but no telemetry arrived -> station becomes DATA_MISSING."""
        seatbelt, machine, station = get_context(db, seatbelt_id, machine_id)
        require_unlocked(station)
        if station.current_run is not None or station.status not in (
                MachineStatus.NOT_STARTED.value, MachineStatus.IN_PROGRESS.value):
            raise HTTPException(status_code=409, detail=f"{machine.machine_code} is {station.status}; it cannot be flagged as data missing.")
        old = station.status
        seatbelt.current_machine_id = machine.id
        seatbelt.current_status = MachineStatus.DATA_MISSING.value
        recompute_state(db, seatbelt)
        AuditService.log_action(
            db, action="DATA_MISSING_FLAGGED", user_id=user_id, seatbelt_id=seatbelt_id, machine_id=machine_id,
            old_status=old, new_status=MachineStatus.DATA_MISSING.value, new_data={"notes": notes},
            reason="Station telemetry missing - awaiting manual data entry", ip_address=ip,
        )
        commit_or_conflict(db)
        return {"success": True, "message": f"{machine.machine_code} flagged as DATA_MISSING.",
                "seatbelt_id": seatbelt_id, "machine_id": machine_id, "machine_status": MachineStatus.DATA_MISSING.value}
