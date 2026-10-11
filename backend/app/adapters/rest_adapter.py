from typing import Dict, Any, Optional
from app.adapters.base import BaseMachineAdapter, AdapterNotImplementedError


class RestApiAdapter(BaseMachineAdapter):
    """HTTP/REST telemetry adapter. INTEGRATION POINT: implement with httpx using config["endpoint_url"]
    and config["api_key"] (never hard-code keys)."""

    def __init__(self, machine_code, config=None, parameters_schema=None):
        super().__init__(machine_code, config, parameters_schema)
        self.endpoint_url = self.config.get("endpoint_url", "")

    def test_connection(self) -> Dict[str, Any]:
        return {"connected": False, "protocol": "HTTP/REST API", "status": "DRIVER_NOT_INSTALLED",
                "endpoint": self.endpoint_url or "not configured",
                "message": "REST telemetry client is not implemented in this build."}

    def read_parameters(self, seatbelt_qr: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise AdapterNotImplementedError("REST_API adapter is not implemented in this build")

    def trigger_machine_cycle(self, seatbelt_qr: str, operator_id: int, simulate_failure: bool = False) -> Dict[str, Any]:
        raise AdapterNotImplementedError("REST_API adapter is not implemented in this build")
