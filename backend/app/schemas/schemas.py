import math
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["PRODUCTION", "QUALITY", "SUPERVISOR", "ADMIN"]
UserState = Literal["ACTIVE", "INACTIVE"]
Lang = Literal["en", "ta"]
RunResultLit = Literal["PASS", "FAIL"]

REWORK_REASONS = ["Part not run", "Machine error", "Sensor error", "Parameter error", "Assembly issue", "Quality issue", "Other"]

ORM = ConfigDict(from_attributes=True)


def _clean_params(v: Dict[str, Any]) -> Dict[str, Any]:
    if len(v) > 64:
        raise ValueError("Too many parameters")
    for k, val in v.items():
        if len(k) > 100:
            raise ValueError("Parameter name too long")
        if isinstance(val, bool) or val is None:
            continue
        if isinstance(val, (int, float)):
            if not math.isfinite(val):
                raise ValueError(f"Parameter '{k}' must be a finite number")
        elif isinstance(val, str):
            if len(val) > 200:
                raise ValueError(f"Parameter '{k}' is too long")
        else:
            raise ValueError(f"Parameter '{k}' must be a number or text")
    return v


# --- AUTH & USER ---------------------------------------------------------
class LoginRequest(BaseModel):
    employee_id: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: int
    employee_id: str
    name: str
    role: str
    language: str
    status: str
    model_config = ORM


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class OperatorItem(BaseModel):
    id: int
    employee_id: str
    name: str
    role: str
    model_config = ORM


def _check_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return v


class UserCreate(BaseModel):
    employee_id: str = Field(min_length=2, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    name: str = Field(min_length=1, max_length=100)
    role: Role
    language: Lang = "en"
    status: UserState = "ACTIVE"
    password: str

    _pw = field_validator("password")(_check_password)


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[Role] = None
    language: Optional[Lang] = None
    status: Optional[UserState] = None
    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        return _check_password(v) if v is not None else v


class UserResponse(BaseModel):
    id: int
    employee_id: str
    name: str
    role: str
    language: str
    status: str
    created_at: datetime
    model_config = ORM


# --- MACHINES ------------------------------------------------------------
class ParameterSchema(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=150)
    label_ta: Optional[str] = None
    type: Literal["number", "string", "boolean"] = "number"
    unit: Optional[str] = ""
    nominal: Optional[Any] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    std_dev: Optional[float] = None
    required: bool = True

    model_config = ConfigDict(extra="allow")


class MachineResponse(BaseModel):
    id: int
    machine_code: str
    machine_name: str
    sequence_number: int
    status: str
    description: Optional[str] = None
    parameters_schema: Optional[List[Dict[str, Any]]] = None
    adapter_type: str
    adapter_config: Optional[Dict[str, Any]] = None
    created_at: datetime
    model_config = ORM


class MachineConfigUpdate(BaseModel):
    adapter_type: Optional[str] = None
    adapter_config: Optional[Dict[str, Any]] = None
    parameters_schema: Optional[List[ParameterSchema]] = None


# --- RUNS ----------------------------------------------------------------
class MachineRunResponse(BaseModel):
    id: int
    seatbelt_id: int
    machine_id: int
    run_number: int
    operator_id: int
    operator_name: Optional[str] = None
    operator_employee_id: Optional[str] = None
    run_type: str
    machine_data: Dict[str, Any]
    result: str
    status: str
    is_current: bool
    reason: Optional[str] = None
    data_source: str
    started_at: datetime
    completed_at: datetime
    created_at: datetime
    model_config = ORM


# --- SEATBELTS -----------------------------------------------------------
class SeatbeltCreate(BaseModel):
    qr_code: str = Field(min_length=3, max_length=100)
    seatbelt_number: Optional[str] = Field(None, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    batch_number: str = Field(min_length=1, max_length=100)

    @field_validator("qr_code", "model", "batch_number")
    @classmethod
    def _strip(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v


class ScanQRRequest(BaseModel):
    qr_code: str = Field(min_length=1, max_length=200)


# --- WORKFLOWS -----------------------------------------------------------
class RunStationRequest(BaseModel):
    seatbelt_id: int
    machine_id: int
    machine_parameters: Optional[Dict[str, Any]] = None  # omit => adapter cycle
    result: Optional[RunResultLit] = None  # only honoured for adapter cycles with simulate_failure
    trigger_simulator: bool = True

    @field_validator("machine_parameters")
    @classmethod
    def _p(cls, v):
        return _clean_params(v) if v is not None else v


class ReworkInitiateRequest(BaseModel):
    seatbelt_id: int
    machine_id: int
    reason: str = Field(min_length=1, max_length=150)
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        if v not in REWORK_REASONS:
            raise ValueError(f"reason must be one of: {', '.join(REWORK_REASONS)}")
        return v


class ReworkResponse(BaseModel):
    success: bool
    message: str
    seatbelt_id: int
    machine_id: int
    new_run_number: int
    previous_run_id: Optional[int] = None
    machine_status: str
    rework_record_id: int


class RerunExecuteRequest(RunStationRequest):
    pass


class FlagMissingRequest(BaseModel):
    seatbelt_id: int
    machine_id: int
    notes: Optional[str] = Field(None, max_length=500)


class ManualDataEntryRequest(BaseModel):
    seatbelt_id: int
    machine_id: int
    operator_id: Optional[int] = None
    run_at: Optional[datetime] = None  # preferred: ISO timestamp with timezone
    run_date: Optional[str] = None  # legacy YYYY-MM-DD (UTC)
    run_time: Optional[str] = None  # legacy HH:MM (UTC)
    machine_parameters: Dict[str, Any]
    result: RunResultLit = "PASS"
    reason: str = Field(min_length=3, max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("machine_parameters")
    @classmethod
    def _p(cls, v):
        return _clean_params(v)

    @field_validator("result", mode="before")
    @classmethod
    def _upper(cls, v):
        return v.upper() if isinstance(v, str) else v


class ManualDataEntryResponse(BaseModel):
    success: bool
    message: str
    seatbelt_id: int
    machine_id: int
    run_id: int
    machine_status: str
    unlocked_next_machine_id: Optional[int] = None


class QualityReviewRequest(BaseModel):
    seatbelt_id: int
    machine_id: int
    run_id: int
    decision: Literal["APPROVED", "REJECTED"]
    comments: str = Field(min_length=3, max_length=2000)

    @field_validator("decision", mode="before")
    @classmethod
    def _upper(cls, v):
        return v.upper() if isinstance(v, str) else v


class QualityReviewResponse(BaseModel):
    success: bool
    message: str
    seatbelt_id: int
    machine_id: int
    decision: str
    machine_status: str


# --- DASHBOARD -----------------------------------------------------------
class DashboardKPISummary(BaseModel):
    total_production: int
    completed: int
    in_progress: int
    rework_required: int
    data_missing: int
    quality_pending: int
    rejected: int
    first_pass_yield: Optional[float] = None  # % ; null when no production data
    active_operators_count: int


class MachineThroughputItem(BaseModel):
    machine_id: int
    machine_code: str
    machine_name: str
    sequence_number: int
    total_processed: int
    pass_count: int  # clean machine-run passes
    rework_count: int  # rework runs + failed runs
    missing_data_count: int  # manual data entries
    current_in_queue: int
    avg_cycle_time_sec: Optional[float] = None


class ReworkReasonPareto(BaseModel):
    reason: str
    count: int
    percentage: float


class MissingDataByMachine(BaseModel):
    machine_code: str
    machine_name: str
    count: int


class RecentFloorActivity(BaseModel):
    id: int
    timestamp: datetime
    seatbelt_qr: str
    machine_code: str
    action: str
    user_name: str
    user_role: str
    run_type: Optional[str] = None
    result: Optional[str] = None
    status: str


class DashboardResponse(BaseModel):
    kpi_summary: DashboardKPISummary
    machine_throughput: List[MachineThroughputItem]
    rework_pareto: List[ReworkReasonPareto]
    missing_data_stats: List[MissingDataByMachine]
    recent_activities: List[RecentFloorActivity]
