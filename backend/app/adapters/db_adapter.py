from typing import Dict, Any, Optional
from app.adapters.base import BaseMachineAdapter, AdapterNotImplementedError


class DatabaseAdapter(BaseMachineAdapter):
    """Direct SQL/ODBC machine database adapter. INTEGRATION POINT: query config["table_name"] on config["db_host"]."""

    def test_connection(self) -> Dict[str, Any]:
        return {"connected": False, "protocol": "SQL / ODBC", "status": "DRIVER_NOT_INSTALLED",
                "host": self.config.get("db_host", "not configured"),
                "message": "SQL machine-database link is not implemented in this build."}

    def read_parameters(self, seatbelt_qr: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise AdapterNotImplementedError("SQL_DB adapter is not implemented in this build")

    def trigger_machine_cycle(self, seatbelt_qr: str, operator_id: int, simulate_failure: bool = False) -> Dict[str, Any]:
        raise AdapterNotImplementedError("SQL_DB adapter is not implemented in this build")


class CsvFileWatcherAdapter(BaseMachineAdapter):
    """CSV drop-folder adapter. INTEGRATION POINT: watch config["watch_folder"] for machine CSV logs."""

    def test_connection(self) -> Dict[str, Any]:
        return {"connected": False, "protocol": "CSV FILE WATCHER", "status": "DRIVER_NOT_INSTALLED",
                "path": self.config.get("watch_folder", "not configured"),
                "message": "CSV folder watcher is not implemented in this build."}

    def read_parameters(self, seatbelt_qr: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise AdapterNotImplementedError("CSV_WATCHER adapter is not implemented in this build")

    def trigger_machine_cycle(self, seatbelt_qr: str, operator_id: int, simulate_failure: bool = False) -> Dict[str, Any]:
        raise AdapterNotImplementedError("CSV_WATCHER adapter is not implemented in this build")
