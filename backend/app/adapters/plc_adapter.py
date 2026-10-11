from typing import Dict, Any, Optional
from app.adapters.base import BaseMachineAdapter, AdapterNotImplementedError


class PLCModbusAdapter(BaseMachineAdapter):
    """Industrial PLC / OPC-UA / Modbus TCP adapter.

    INTEGRATION POINT: no Modbus/OPC-UA driver is bundled. Implement read_parameters /
    trigger_machine_cycle with pymodbus (or asyncua) and map registers via config["register_mapping"].
    Until then the adapter reports itself as not connected instead of faking data.
    """

    def __init__(self, machine_code, config=None, parameters_schema=None):
        super().__init__(machine_code, config, parameters_schema)
        self.ip_address = self.config.get("ip_address", "")
        self.port = self.config.get("port", 502)
        self.slave_id = self.config.get("slave_id", 1)

    def test_connection(self) -> Dict[str, Any]:
        return {"connected": False, "protocol": "MODBUS_TCP / OPC-UA", "status": "DRIVER_NOT_INSTALLED",
                "endpoint": f"{self.ip_address}:{self.port} (slave {self.slave_id})" if self.ip_address else "not configured",
                "message": "No PLC driver is installed in this build; use the SIMULATOR adapter or manual data entry."}

    def read_parameters(self, seatbelt_qr: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise AdapterNotImplementedError("PLC_MODBUS driver is not implemented in this build")

    def trigger_machine_cycle(self, seatbelt_qr: str, operator_id: int, simulate_failure: bool = False) -> Dict[str, Any]:
        raise AdapterNotImplementedError("PLC_MODBUS driver is not implemented in this build")
