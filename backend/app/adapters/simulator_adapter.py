import random
import time
from typing import Dict, Any, List, Optional
from app.adapters.base import BaseMachineAdapter

class HardwareSimulatorAdapter(BaseMachineAdapter):
    """
    Simulates high-precision industrial sensors for automotive seatbelt manufacturing machines.
    Generates realistic sensor telemetry within tolerance bands, with optional failure simulation.
    """
    
    DEFAULT_MACHINE_PROFILES = {
        "M1": {
            "name": "Webbing Cutting & Heat-Sealing Station",
            "params": [
                {"name": "webbing_length", "label": "Webbing Length", "label_ta": "நாடா நீளம்", "type": "number", "unit": "mm", "nominal": 2850.0, "min_value": 2840.0, "max_value": 2860.0, "std_dev": 1.8},
                {"name": "cutting_temp", "label": "Hot Knife Temperature", "label_ta": "வெட்டு வெப்பநிலை", "type": "number", "unit": "°C", "nominal": 245.0, "min_value": 235.0, "max_value": 255.0, "std_dev": 2.1},
                {"name": "seal_dwell_time", "label": "Seal Dwell Time", "label_ta": "சீல் வைக்கும் நேரம்", "type": "number", "unit": "sec", "nominal": 1.85, "min_value": 1.50, "max_value": 2.20, "std_dev": 0.05},
                {"name": "feed_tension", "label": "Webbing Feed Tension", "label_ta": "ஊட்ட இழுவிசை", "type": "number", "unit": "N", "nominal": 15.2, "min_value": 12.0, "max_value": 18.0, "std_dev": 0.4}
            ]
        },
        "M2": {
            "name": "Retractor Spool & Spring Preload Assembly",
            "params": [
                {"name": "retraction_torque", "label": "Retraction Spring Torque", "label_ta": "ஸ்பிரிங் முறுக்குவிசை", "type": "number", "unit": "Nm", "nominal": 0.48, "min_value": 0.42, "max_value": 0.55, "std_dev": 0.015},
                {"name": "preload_turns", "label": "Spring Preload Revolutions", "label_ta": "ப்ரீலோட் சுழற்சிகள்", "type": "number", "unit": "rev", "nominal": 3.0, "min_value": 2.9, "max_value": 3.1, "std_dev": 0.02},
                {"name": "lock_speed", "label": "Centrifugal Lock Activation Speed", "label_ta": "பூட்டு செயல்பாட்டு வேகம்", "type": "number", "unit": "m/s", "nominal": 1.42, "min_value": 1.20, "max_value": 1.65, "std_dev": 0.04},
                {"name": "spool_axial_play", "label": "Spool Axial Clearance", "label_ta": "அச்சு இடைவெளி", "type": "number", "unit": "mm", "nominal": 0.22, "min_value": 0.15, "max_value": 0.30, "std_dev": 0.02}
            ]
        },
        "M3": {
            "name": "Pyrotechnic Pretensioner Installation",
            "params": [
                {"name": "squib_resistance", "label": "MGG Squib Circuit Resistance", "label_ta": "மின்சுற்று மின்தடை", "type": "number", "unit": "Ω", "nominal": 2.15, "min_value": 1.80, "max_value": 2.50, "std_dev": 0.06},
                {"name": "crimp_pressure", "label": "Tube Crimping Force", "label_ta": "குழாய் அழுத்து விசை", "type": "number", "unit": "kN", "nominal": 14.8, "min_value": 13.5, "max_value": 16.0, "std_dev": 0.3},
                {"name": "insertion_depth", "label": "Rack Piston Insertion Depth", "label_ta": "பிஸ்டன் ஆழம்", "type": "number", "unit": "mm", "nominal": 42.5, "min_value": 41.8, "max_value": 43.2, "std_dev": 0.15},
                {"name": "leak_test_pressure", "label": "Helium Leak Chamber Pressure", "label_ta": "கசிவு சோதனை அழுத்தம்", "type": "number", "unit": "bar", "nominal": 5.0, "min_value": 4.8, "max_value": 5.2, "std_dev": 0.04}
            ]
        },
        "M4": {
            "name": "Buckle & Latch Plate Robotic Assembly",
            "params": [
                {"name": "insertion_force", "label": "Latch Insertion Peak Force", "label_ta": "நுழைவு உச்ச விசை", "type": "number", "unit": "N", "nominal": 22.5, "min_value": 18.0, "max_value": 28.0, "std_dev": 1.1},
                {"name": "ejection_force", "label": "Push-Button Release Force", "label_ta": "வெளியேற்றும் விசை", "type": "number", "unit": "N", "nominal": 26.0, "min_value": 20.0, "max_value": 32.0, "std_dev": 1.2},
                {"name": "switch_contact_res", "label": "Belt-Buckled Sensor Resistance", "label_ta": "சென்சார் மின்தடை", "type": "number", "unit": "mΩ", "nominal": 45.0, "min_value": 20.0, "max_value": 80.0, "std_dev": 6.5},
                {"name": "optical_latch_status", "label": "Dual Pawl Engagement Check", "label_ta": "இரட்டை பூட்டு சோதனை", "type": "string", "nominal": "PASS", "required": True}
            ]
        },
        "M5": {
            "name": "Load Limiter & Torsion Bar Calibration",
            "params": [
                {"name": "torsion_yield_torque", "label": "Torsion Bar Yield Peak Torque", "label_ta": "முறுக்கு தண்டு வளைவு விசை", "type": "number", "unit": "Nm", "nominal": 180.0, "min_value": 165.0, "max_value": 195.0, "std_dev": 3.8},
                {"name": "load_limiter_threshold", "label": "Load Limiting Constant Force", "label_ta": "சுமை வரம்பு விசை", "type": "number", "unit": "kN", "nominal": 3.85, "min_value": 3.40, "max_value": 4.30, "std_dev": 0.1},
                {"name": "sensor_voltage", "label": "Hall Effect Sensor Voltage", "label_ta": "சென்சார் மின்னழுத்தம்", "type": "number", "unit": "V", "nominal": 4.95, "min_value": 4.75, "max_value": 5.15, "std_dev": 0.05},
                {"name": "calibration_result", "label": "Calibration Confirmation", "label_ta": "அளவீட்டு உறுதிப்படுத்தல்", "type": "string", "nominal": "PASS", "required": True}
            ]
        },
        "M6": {
            "name": "Final Tensile & Optical Inspection",
            "params": [
                {"name": "proof_tensile_load", "label": "100% Proof Load Tensile Test", "label_ta": "இழுவிசை சோதனை சுமை", "type": "number", "unit": "kN", "nominal": 18.5, "min_value": 15.0, "max_value": 22.0, "std_dev": 0.6},
                {"name": "elongation_percentage", "label": "Webbing Elongation Rate", "label_ta": "நீட்சி சதவீதம்", "type": "number", "unit": "%", "nominal": 8.2, "min_value": 6.0, "max_value": 11.0, "std_dev": 0.4},
                {"name": "vision_ai_stitch_score", "label": "AI Vision Stitch Inspection Score", "label_ta": "தையல் பார்வை ஆய்வு தரம்", "type": "number", "unit": "%", "nominal": 99.2, "min_value": 95.0, "max_value": 100.0, "std_dev": 0.5},
                {"name": "qr_print_grade", "label": "Laser Etched QR ISO Grade", "label_ta": "QR குறியீடு தரம்", "type": "string", "nominal": "GRADE_A", "required": True}
            ]
        }
    }

    def _params(self) -> List[Dict[str, Any]]:
        """Prefer the machine's configured schema (so admin tolerance edits are honoured)."""
        if self.parameters_schema:
            return self.parameters_schema
        return self.DEFAULT_MACHINE_PROFILES.get(self.machine_code, {}).get("params", [])

    def test_connection(self) -> Dict[str, Any]:
        return {
            "connected": True,
            "simulated": True,
            "protocol": "HIGH_SPEED_SENSOR_SIMULATOR",
            "machine_code": self.machine_code,
            "status": "ONLINE",
            "latency_ms": 0.0,
            "message": "Software simulator - no physical hardware attached.",
        }

    def read_parameters(self, seatbelt_qr: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        data: Dict[str, Any] = {}
        for p in self._params():
            if p.get("type", "number") == "number":
                data[p["name"]] = round(random.gauss(p.get("nominal", 50.0), p.get("std_dev") or 1.0), 2)
            else:
                data[p["name"]] = p.get("nominal", "PASS")
        return data

    def trigger_machine_cycle(self, seatbelt_qr: str, operator_id: int, simulate_failure: bool = False) -> Dict[str, Any]:
        params = self._params()
        data: Dict[str, Any] = {}
        result = "PASS"
        fail_names = {params[0]["name"], params[-1]["name"]} if params else set()

        for p in params:
            name = p["name"]
            is_num = p.get("type", "number") == "number"
            lo = p.get("min_value", 0)
            hi = p.get("max_value", 100)
            if simulate_failure and name in fail_names:
                data[name] = round(hi * 1.35, 2) if is_num else "FAIL"
                result = "FAIL"
            elif is_num:
                nominal = p.get("nominal", (lo + hi) / 2)
                val = random.gauss(nominal, p.get("std_dev") or 1.0)
                span = (hi - lo) or 1.0
                eps = span * 0.01
                data[name] = round(max(lo + eps, min(hi - eps, val)), 2)
            else:
                data[name] = p.get("nominal", "PASS")

        return {
            "cycle_id": f"CYC-{int(time.time() * 1000)}",
            "seatbelt_qr": seatbelt_qr,
            "machine_code": self.machine_code,
            "operator_id": operator_id,
            "data": data,
            "result": result,
            "cycle_time_sec": round(random.uniform(4.5, 8.2), 1),
            "data_source": "SIMULATED_PLC_SENSOR",
        }
