import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, event
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import relationship
from app.db.database import Base


def now_utc() -> datetime:
    """Timezone-aware current UTC time."""
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Stores naive UTC in the DB (same on-disk format as v1.0) but always returns tz-aware UTC,
    so the API serialises timestamps with an explicit offset and browsers show correct local time."""
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)

class UserRole(str, enum.Enum):
    PRODUCTION = "PRODUCTION"
    QUALITY = "QUALITY"
    SUPERVISOR = "SUPERVISOR"
    ADMIN = "ADMIN"

class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"

class RunType(str, enum.Enum):
    MACHINE_RUN = "MACHINE_RUN"
    REWORK_RUN = "REWORK_RUN"
    MANUAL_DATA_ENTRY = "MANUAL_DATA_ENTRY"

class RunResult(str, enum.Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    REWORK = "REWORK"
    PENDING = "PENDING"

class MachineStatus(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    DATA_MISSING = "DATA_MISSING"
    REWORK_REQUIRED = "REWORK_REQUIRED"
    READY_FOR_RERUN = "READY_FOR_RERUN"
    QUALITY_PENDING = "QUALITY_PENDING"
    QUALITY_APPROVED = "QUALITY_APPROVED"
    QUALITY_REJECTED = "QUALITY_REJECTED"
    BLOCKED = "BLOCKED"

class QualityDecision(str, enum.Enum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    employee_id = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default=UserRole.PRODUCTION.value, nullable=False)
    status = Column(String(50), default=UserStatus.ACTIVE.value, nullable=False)
    language = Column(String(10), default="en", nullable=False)
    created_at = Column(UTCDateTime, default=now_utc, nullable=False)

    # Relationships
    runs = relationship("MachineRun", back_populates="operator", foreign_keys="MachineRun.operator_id")
    quality_reviews = relationship("QualityReview", back_populates="quality_user")
    audit_logs = relationship("AuditLog", back_populates="user")


class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_code = Column(String(50), unique=True, index=True, nullable=False)  # e.g., M1, M2...
    machine_name = Column(String(150), nullable=False)
    sequence_number = Column(Integer, nullable=False, index=True)
    status = Column(String(50), default="OPERATIONAL", nullable=False)
    description = Column(Text, nullable=True)
    parameters_schema = Column(JSON, nullable=True)  # List of parameters, min/max tolerances, unit
    adapter_type = Column(String(50), default="SIMULATOR", nullable=False)  # SIMULATOR, PLC_MODBUS, REST_API, SQL_DB, CSV_WATCHER
    adapter_config = Column(JSON, nullable=True)
    created_at = Column(UTCDateTime, default=now_utc, nullable=False)

    # Relationships
    runs = relationship("MachineRun", back_populates="machine")
    rework_records = relationship("ReworkHistory", back_populates="machine")


class Seatbelt(Base):
    __tablename__ = "seatbelts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    qr_code = Column(String(100), unique=True, index=True, nullable=False)  # e.g. SB-2026-000123
    seatbelt_number = Column(String(100), unique=True, index=True, nullable=False)
    model = Column(String(100), nullable=False)  # e.g. Sedan Front-Left 3-Point ELR
    batch_number = Column(String(100), nullable=False)
    current_machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    current_status = Column(String(50), default=MachineStatus.NOT_STARTED.value, nullable=False)
    created_at = Column(UTCDateTime, default=now_utc, nullable=False)
    updated_at = Column(UTCDateTime, default=now_utc, onupdate=now_utc, nullable=False)

    # Relationships
    current_machine = relationship("Machine", foreign_keys=[current_machine_id])
    runs = relationship("MachineRun", back_populates="seatbelt", cascade="save-update, merge", passive_deletes=True)
    rework_history = relationship("ReworkHistory", back_populates="seatbelt", cascade="save-update, merge", passive_deletes=True)
    quality_reviews = relationship("QualityReview", back_populates="seatbelt", cascade="save-update, merge", passive_deletes=True)
    audit_logs = relationship("AuditLog", back_populates="seatbelt", cascade="save-update, merge", passive_deletes=True)


class MachineRun(Base):
    __tablename__ = "machine_runs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    seatbelt_id = Column(Integer, ForeignKey("seatbelts.id"), nullable=False, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    run_number = Column(Integer, default=1, nullable=False)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    run_type = Column(String(50), default=RunType.MACHINE_RUN.value, nullable=False)  # MACHINE_RUN, REWORK_RUN, MANUAL_DATA_ENTRY
    machine_data = Column(JSON, nullable=False)  # { "param1": 25.4, "param2": 180, ... }
    result = Column(String(50), default=RunResult.PASS.value, nullable=False)  # PASS, FAIL, REWORK
    status = Column(String(50), default=MachineStatus.COMPLETED.value, nullable=False)
    is_current = Column(Boolean, default=True, nullable=False)  # True = current active run for this machine; False = history
    reason = Column(Text, nullable=True)  # Used for rework or missing data justification
    data_source = Column(String(100), default="PLC_HARDWARE", nullable=False)  # PLC, MANUAL_OVERRIDE, SIMULATOR, CSV_IMPORT
    started_at = Column(UTCDateTime, default=now_utc, nullable=False)
    completed_at = Column(UTCDateTime, default=now_utc, nullable=False)
    created_at = Column(UTCDateTime, default=now_utc, nullable=False)

    # Relationships
    seatbelt = relationship("Seatbelt", back_populates="runs")
    machine = relationship("Machine", back_populates="runs")
    operator = relationship("User", back_populates="runs", foreign_keys=[operator_id])
    quality_reviews = relationship("QualityReview", back_populates="run")


class ReworkHistory(Base):
    __tablename__ = "rework_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    seatbelt_id = Column(Integer, ForeignKey("seatbelts.id"), nullable=False, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    previous_run_id = Column(Integer, ForeignKey("machine_runs.id"), nullable=True)
    new_run_id = Column(Integer, ForeignKey("machine_runs.id"), nullable=True)
    rework_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(String(150), nullable=False)  # e.g., Part not run, Machine error, Sensor error, Parameter error, Assembly issue, Quality issue, Other
    notes = Column(Text, nullable=True)
    status = Column(String(50), default="INITIATED", nullable=False)  # INITIATED, IN_PROGRESS, RESOLVED
    created_at = Column(UTCDateTime, default=now_utc, nullable=False)

    # Relationships
    seatbelt = relationship("Seatbelt", back_populates="rework_history")
    machine = relationship("Machine", back_populates="rework_records")
    rework_user = relationship("User", foreign_keys=[rework_by])
    previous_run = relationship("MachineRun", foreign_keys=[previous_run_id])
    new_run = relationship("MachineRun", foreign_keys=[new_run_id])


class QualityReview(Base):
    __tablename__ = "quality_reviews"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    seatbelt_id = Column(Integer, ForeignKey("seatbelts.id"), nullable=False, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    run_id = Column(Integer, ForeignKey("machine_runs.id"), nullable=False)
    quality_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    decision = Column(String(50), nullable=False)  # APPROVED, REJECTED
    comments = Column(Text, nullable=True)
    reviewed_at = Column(UTCDateTime, default=now_utc, nullable=False)

    # Relationships
    seatbelt = relationship("Seatbelt", back_populates="quality_reviews")
    machine = relationship("Machine")
    run = relationship("MachineRun", back_populates="quality_reviews")
    quality_user = relationship("User", back_populates="quality_reviews")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    seatbelt_id = Column(Integer, ForeignKey("seatbelts.id"), nullable=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    action = Column(String(100), nullable=False)  # MANUAL_DATA_ENTRY, REWORK_INITIATED, RERUN_COMPLETED, QUALITY_APPROVED, etc.
    old_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    old_data = Column(JSON, nullable=True)
    new_data = Column(JSON, nullable=True)
    reason = Column(Text, nullable=True)
    ip_address = Column(String(100), nullable=True)
    created_at = Column(UTCDateTime, default=now_utc, nullable=False)

    # Relationships
    user = relationship("User", back_populates="audit_logs")
    seatbelt = relationship("Seatbelt", back_populates="audit_logs")
    machine = relationship("Machine")


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(UTCDateTime, default=now_utc, onupdate=now_utc, nullable=False)


# --- Audit trail immutability ---------------------------------------------
@event.listens_for(AuditLog, "before_update")
def _audit_no_update(mapper, connection, target):
    raise ValueError("Audit log records are immutable and cannot be modified")


@event.listens_for(AuditLog, "before_delete")
def _audit_no_delete(mapper, connection, target):
    raise ValueError("Audit log records are immutable and cannot be deleted")
