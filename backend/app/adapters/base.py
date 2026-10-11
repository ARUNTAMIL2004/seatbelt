import math
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Tuple, Optional

FAIL_TOKENS = {"FAIL", "FAILED", "NG", "REJECT", "REJECTED", "ERROR"}


class AdapterError(Exception):
    """Raised when a machine adapter cannot deliver data (connection / not implemented)."""


class AdapterNotImplementedError(AdapterError):
    pass


class BaseMachineAdapter(ABC):
    SENSITIVE_KEYS = ("api_key", "password", "token", "secret")

    def __init__(self, machine_code: str, config: Optional[Dict[str, Any]] = None,
                 parameters_schema: Optional[List[Dict[str, Any]]] = None):
        self.machine_code = machine_code
        self.config = config or {}
        self.parameters_schema = parameters_schema

    @abstractmethod
    def test_connection(self) -> Dict[str, Any]:
        """Verify connectivity to machine PLC/API/Database."""

    @abstractmethod
    def read_parameters(self, seatbelt_qr: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Read sensor/process parameters from machine."""

    @abstractmethod
    def trigger_machine_cycle(self, seatbelt_qr: str, operator_id: int, simulate_failure: bool = False) -> Dict[str, Any]:
        """Run a production cycle. Must return {"data": {...}, "result": "PASS"|"FAIL", ...}."""

    @staticmethod
    def validate_parameters(data: Dict[str, Any], schema: Optional[List[Dict[str, Any]]],
                            reject_unknown: bool = True,
                            check_limits: bool = True) -> Tuple[bool, List[str]]:
        """Validate values against the machine parameter schema (type, min, max, FAIL tokens)."""
        if not schema:
            return True, []
        errors: List[str] = []
        known = {p.get("name") for p in schema}
        if reject_unknown:
            for key in data:
                if key not in known:
                    errors.append(f"Unknown parameter '{key}' for this station")

        for param in schema:
            name = param.get("name")
            label = param.get("label", name)
            unit = param.get("unit") or ""
            if name not in data or data[name] is None or data[name] == "":
                if param.get("required", True):
                    errors.append(f"Missing required parameter: {label}")
                continue
            val = data[name]
            if param.get("type", "number") == "number":
                if isinstance(val, bool):
                    errors.append(f"'{label}' must be a valid number")
                    continue
                try:
                    num = float(val)
                    if not math.isfinite(num):
                        raise ValueError
                except (ValueError, TypeError):
                    errors.append(f"'{label}' must be a valid number")
                    continue
                if not check_limits:
                    continue
                lo, hi = param.get("min_value"), param.get("max_value")
                if lo is not None and num < lo:
                    errors.append(f"'{label}' ({num} {unit}) is below the minimum limit ({lo} {unit})".replace("  ", " "))
                if hi is not None and num > hi:
                    errors.append(f"'{label}' ({num} {unit}) exceeds the maximum limit ({hi} {unit})".replace("  ", " "))
            else:
                if check_limits and str(val).strip().upper() in FAIL_TOKENS:
                    errors.append(f"'{label}' reported {val}")
        return len(errors) == 0, errors

    @classmethod
    def redact_config(cls, config: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not config:
            return config
        return {k: ("********" if any(s in k.lower() for s in cls.SENSITIVE_KEYS) and v else v) for k, v in config.items()}
