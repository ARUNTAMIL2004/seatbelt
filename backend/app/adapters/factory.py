from typing import Dict, Any, Optional, List
from app.adapters.base import BaseMachineAdapter
from app.adapters.plc_adapter import PLCModbusAdapter
from app.adapters.rest_adapter import RestApiAdapter
from app.adapters.db_adapter import DatabaseAdapter, CsvFileWatcherAdapter
from app.adapters.simulator_adapter import HardwareSimulatorAdapter

ADAPTER_REGISTRY = {
    "SIMULATOR": HardwareSimulatorAdapter,
    "PLC_MODBUS": PLCModbusAdapter,
    "REST_API": RestApiAdapter,
    "SQL_DB": DatabaseAdapter,
    "CSV_WATCHER": CsvFileWatcherAdapter,
}


def get_machine_adapter(machine_code: str, adapter_type: str = "SIMULATOR",
                        config: Optional[Dict[str, Any]] = None,
                        parameters_schema: Optional[List[Dict[str, Any]]] = None) -> BaseMachineAdapter:
    """Instantiate the configured adapter. Unknown types raise instead of silently simulating."""
    adapter_cls = ADAPTER_REGISTRY.get((adapter_type or "").upper())
    if adapter_cls is None:
        raise ValueError(f"Unknown adapter type '{adapter_type}'. Valid: {', '.join(ADAPTER_REGISTRY)}")
    return adapter_cls(machine_code=machine_code, config=config or {}, parameters_schema=parameters_schema)
