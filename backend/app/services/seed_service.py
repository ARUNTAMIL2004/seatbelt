import logging
from datetime import timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_password_hash
from app.adapters.simulator_adapter import HardwareSimulatorAdapter
from app.models.models import (
    User, Machine, Seatbelt, MachineRun, ReworkHistory, AuditLog, SystemSetting,
    MachineStatus, RunType, RunResult, UserRole, UserStatus, now_utc,
)
from app.services.seatbelt_service import recompute_state

logger = logging.getLogger("seatbelt.seed")


def _readings(code: str, fail: bool = False) -> dict:
    """Schema-valid sensor readings from the simulator (or a deliberate out-of-tolerance set)."""
    return HardwareSimulatorAdapter(code).trigger_machine_cycle("seed", 0, simulate_failure=fail)["data"]


def seed_database(db: Session):
    """Create reference data (machines) always, and demo users/seatbelts when SEED_DEMO_DATA is on."""
    # 1. Machines (reference data: required for the line to operate)
    if db.query(Machine).count() == 0:
        machine_definitions = [
            {
                "machine_code": "M1",
                "machine_name": "Webbing Cutting & Heat-Sealing Station",
                "sequence_number": 1,
                "description": "High precision ultrasonic cutting and hot-knife edge sealing for seatbelt webbing",
                "parameters_schema": HardwareSimulatorAdapter.DEFAULT_MACHINE_PROFILES["M1"]["params"],
                "adapter_type": "SIMULATOR"
            },
            {
                "machine_code": "M2",
                "machine_name": "Retractor Spool & Spring Preload Assembly",
                "sequence_number": 2,
                "description": "Automated retractor spool insertion, torsional spring tensioning and inertia sensor calibration",
                "parameters_schema": HardwareSimulatorAdapter.DEFAULT_MACHINE_PROFILES["M2"]["params"],
                "adapter_type": "SIMULATOR"
            },
            {
                "machine_code": "M3",
                "machine_name": "Pyrotechnic Pretensioner Installation",
                "sequence_number": 3,
                "description": "Micro-gas generator squib seating, tube crimping and helium chamber leak integrity test",
                "parameters_schema": HardwareSimulatorAdapter.DEFAULT_MACHINE_PROFILES["M3"]["params"],
                "adapter_type": "SIMULATOR"
            },
            {
                "machine_code": "M4",
                "machine_name": "Buckle & Latch Plate Robotic Assembly",
                "sequence_number": 4,
                "description": "Dual-pawl buckle housing assembly, micro-switch insertion and latching force verification",
                "parameters_schema": HardwareSimulatorAdapter.DEFAULT_MACHINE_PROFILES["M4"]["params"],
                "adapter_type": "SIMULATOR"
            },
            {
                "machine_code": "M5",
                "machine_name": "Load Limiter & Torsion Bar Calibration",
                "sequence_number": 5,
                "description": "Controlled plastic deformation torque profiling and dynamic load-limiting threshold testing",
                "parameters_schema": HardwareSimulatorAdapter.DEFAULT_MACHINE_PROFILES["M5"]["params"],
                "adapter_type": "SIMULATOR"
            },
            {
                "machine_code": "M6",
                "machine_name": "Final Tensile & Optical Inspection",
                "sequence_number": 6,
                "description": "100% proof tensile load testing, AI stitch defect detection and QR code laser etching verification",
                "parameters_schema": HardwareSimulatorAdapter.DEFAULT_MACHINE_PROFILES["M6"]["params"],
                "adapter_type": "SIMULATOR"
            }
        ]
        for m_def in machine_definitions:
            m = Machine(
                machine_code=m_def["machine_code"],
                machine_name=m_def["machine_name"],
                sequence_number=m_def["sequence_number"],
                description=m_def["description"],
                parameters_schema=m_def["parameters_schema"],
                adapter_type=m_def["adapter_type"],
                created_at=now_utc()
            )
            db.add(m)
        db.commit()

    if db.query(SystemSetting).count() == 0:
        db.add_all([
            SystemSetting(key="company_name", value=settings.DEFAULT_COMPANY_NAME, description="Legal entity name"),
            SystemSetting(key="plant_location", value=settings.PLANT_LOCATION, description="Plant / line description"),
        ])
        db.commit()

    # First-run administrator (production): only when there are no users at all
    if db.query(User).count() == 0 and settings.BOOTSTRAP_ADMIN_EMPLOYEE_ID and settings.BOOTSTRAP_ADMIN_PASSWORD:
        db.add(User(employee_id=settings.BOOTSTRAP_ADMIN_EMPLOYEE_ID.strip(), name=settings.BOOTSTRAP_ADMIN_NAME,
                    password_hash=get_password_hash(settings.BOOTSTRAP_ADMIN_PASSWORD), role=UserRole.ADMIN.value,
                    status=UserStatus.ACTIVE.value, language="en"))
        db.commit()
        logger.warning("Created bootstrap administrator %s", settings.BOOTSTRAP_ADMIN_EMPLOYEE_ID)

    if not settings.demo_enabled:
        return

    # 2. Demo users
    if db.query(User).count() == 0:
        demo_users = [
            ("OP101", "Ravi Kumar (ரவி குமார்)", UserRole.PRODUCTION, "ta"),
            ("OP102", "Murugan S (முருகன்)", UserRole.PRODUCTION, "en"),
            ("QA201", "Priya Sharma (பிரியா ஷர்மா)", UserRole.QUALITY, "en"),
            ("SUP301", "Karthik Raja (கார்த்திக் ராஜா)", UserRole.SUPERVISOR, "en"),
            ("ADM001", "Anand V (ஆனந்த்)", UserRole.ADMIN, "en"),
        ]
        pw_hash = get_password_hash(settings.DEMO_PASSWORD)
        for emp, name, role, lang in demo_users:
            db.add(User(employee_id=emp, name=name, password_hash=pw_hash, role=role.value,
                        status=UserStatus.ACTIVE.value, language=lang))
        db.commit()
        logger.warning("Seeded demo users (OP101, OP102, QA201, SUP301, ADM001). Disable with SEED_DEMO_DATA=false.")

    # 3. Demo seatbelts + runs
    if db.query(Seatbelt).count() > 0:
        return
    op101 = db.query(User).filter(User.employee_id == "OP101").first()
    op102 = db.query(User).filter(User.employee_id == "OP102").first()
    if not (op101 and op102):
        return
    M = {m.machine_code: m for m in db.query(Machine).all()}
    now = now_utc()

    def make_belt(qr, model, batch, created, cur_code, cur_status):
        sb = Seatbelt(qr_code=qr, seatbelt_number=qr, model=model, batch_number=batch,
                      current_machine_id=M[cur_code].id, current_status=cur_status, created_at=created, updated_at=now)
        db.add(sb)
        db.flush()
        return sb

    def add_run(sb, code, operator, start, minutes=5, run_type=RunType.MACHINE_RUN, result=RunResult.PASS,
                status=MachineStatus.COMPLETED, fail=False, reason=None, data_source="SIMULATED_PLC_SENSOR"):
        end = start + timedelta(minutes=minutes)
        run = MachineRun(seatbelt_id=sb.id, machine_id=M[code].id, run_number=1, operator_id=operator.id,
                         run_type=run_type.value, machine_data=_readings(code, fail), result=result.value,
                         status=status.value, is_current=True, reason=reason, data_source=data_source,
                         started_at=start, completed_at=end, created_at=end)
        db.add(run)
        db.flush()
        action = "MACHINE_RUN_COMPLETED" if run_type == RunType.MACHINE_RUN else "MANUAL_DATA_ENTRY"
        db.add(AuditLog(user_id=operator.id, seatbelt_id=sb.id, machine_id=M[code].id, action=action,
                        old_status=MachineStatus.IN_PROGRESS.value, new_status=status.value,
                        new_data={"run_id": run.id, "run_number": 1, "run_type": run_type.value, "result": result.value},
                        reason=reason or "Cycle finished", created_at=end))
        return run

    def run_through(sb, codes, operator, start):
        t = start
        for c in codes:
            add_run(sb, c, operator, t)
            t += timedelta(minutes=12)
        return t

    # SB-000123: M1-M4 done, telemetry lost at M5
    sb1 = make_belt("SB-2026-000123", "Sedan Front-Left 3-Point ELR Pretensioner", "BATCH-2026-OCT-A1",
                    now - timedelta(hours=4), "M5", MachineStatus.DATA_MISSING.value)
    run_through(sb1, ["M1", "M2", "M3", "M4"], op101, now - timedelta(hours=4))
    db.add(AuditLog(user_id=op101.id, seatbelt_id=sb1.id, machine_id=M["M5"].id, action="DATA_MISSING_FLAGGED",
                    old_status=MachineStatus.IN_PROGRESS.value, new_status=MachineStatus.DATA_MISSING.value,
                    reason="Station telemetry missing - awaiting manual data entry", created_at=now - timedelta(minutes=50)))

    # SB-000124: M5 failed -> rework required
    sb2 = make_belt("SB-2026-000124", "SUV Rear-Right 3-Point Dual-Retractor", "BATCH-2026-OCT-A1",
                    now - timedelta(hours=3), "M5", MachineStatus.REWORK_REQUIRED.value)
    t = run_through(sb2, ["M1", "M2", "M3", "M4"], op101, now - timedelta(hours=3))
    add_run(sb2, "M5", op102, t, result=RunResult.FAIL, status=MachineStatus.REWORK_REQUIRED, fail=True,
            reason="Out-of-tolerance result recorded by station cycle")

    # SB-000125: fully completed
    sb3 = make_belt("SB-2026-000125", "EV Front Passenger Smart Buckle Belt", "BATCH-2026-OCT-A1",
                    now - timedelta(hours=5), "M6", MachineStatus.COMPLETED.value)
    run_through(sb3, ["M1", "M2", "M3", "M4", "M5", "M6"], op101, now - timedelta(hours=5))

    # SB-000126: in progress at M3
    sb4 = make_belt("SB-2026-000126", "Commercial Truck Heavy-Duty 3-Point Belt", "BATCH-2026-OCT-B2",
                    now - timedelta(hours=1), "M3", MachineStatus.IN_PROGRESS.value)
    run_through(sb4, ["M1", "M2"], op102, now - timedelta(hours=1))

    # SB-000127: freshly registered
    make_belt("SB-2026-000127", "Compact Hatchback Front-Driver Belt", "BATCH-2026-OCT-B2",
              now - timedelta(minutes=5), "M1", MachineStatus.NOT_STARTED.value)

    # SB-000128: M5 recovered via manual entry -> awaiting QA verification, M6 unlocked
    sb6 = make_belt("SB-2026-000128", "Luxury Sedan Inflatable Airbag Seatbelt", "BATCH-2026-OCT-B2",
                    now - timedelta(hours=3), "M5", MachineStatus.IN_PROGRESS.value)
    t = run_through(sb6, ["M1", "M2", "M3", "M4"], op101, now - timedelta(hours=3))
    add_run(sb6, "M5", op101, t, minutes=0, run_type=RunType.MANUAL_DATA_ENTRY, data_source="MANUAL_DATA_ENTRY",
            reason="Part physically completed, machine data not recorded due to shopfloor LAN glitch.")

    db.flush()
    for sb in (sb1, sb2, sb3, sb4, sb6):
        recompute_state(db, sb)
    db.commit()
    logger.warning("Seeded demo seatbelts SB-2026-000123 .. SB-2026-000128")
