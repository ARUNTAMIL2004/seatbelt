from datetime import timedelta
from typing import Dict, Any, List

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.models import (
    Seatbelt, Machine, MachineRun, ReworkHistory, AuditLog, MachineStatus, RunType, User, now_utc,
)
from app.services.seatbelt_service import needs_qa


class AnalyticsService:
    @staticmethod
    def get_dashboard_data(db: Session) -> Dict[str, Any]:
        status_counts = dict(db.query(Seatbelt.current_status, func.count(Seatbelt.id)).group_by(Seatbelt.current_status).all())
        total = sum(status_counts.values())
        S = MachineStatus
        completed = status_counts.get(S.COMPLETED.value, 0)
        rework = status_counts.get(S.REWORK_REQUIRED.value, 0) + status_counts.get(S.READY_FOR_RERUN.value, 0)
        rejected = status_counts.get(S.QUALITY_REJECTED.value, 0)
        in_progress = total - completed - rework - rejected

        manual_entries = db.query(MachineRun).filter(MachineRun.run_type == RunType.MANUAL_DATA_ENTRY.value).count()
        current_runs = db.query(MachineRun).filter(
            MachineRun.is_current == True,  # noqa: E712
            MachineRun.status.in_([S.COMPLETED.value, S.QUALITY_PENDING.value])).all()
        qa_pending = sum(1 for r in current_runs if needs_qa(r))

        # First-pass yield: units with >=1 run that never failed and never needed rework / total units with >=1 run
        started_ids = {i for (i,) in db.query(MachineRun.seatbelt_id).distinct().all()}
        failed_ids = {i for (i,) in db.query(MachineRun.seatbelt_id).filter(
            (MachineRun.result.in_(["FAIL", "REWORK"])) | (MachineRun.run_type == RunType.REWORK_RUN.value)).distinct().all()}
        failed_ids |= {i for (i,) in db.query(ReworkHistory.seatbelt_id).distinct().all()}
        fpy = round((len(started_ids - failed_ids) / len(started_ids)) * 100, 1) if started_ids else None

        since = now_utc() - timedelta(hours=24)
        active_ops = db.query(func.count(func.distinct(MachineRun.operator_id))).filter(MachineRun.created_at >= since).scalar() or 0

        machines = db.query(Machine).order_by(Machine.sequence_number.asc()).all()
        # Exclusive run buckets (manual > rework/failed > clean pass), bucketed in Python so the SQL stays
        # identical on SQLite and PostgreSQL.
        agg: Dict[int, Dict[str, int]] = {}
        for mid, rtype, result, cnt in db.query(MachineRun.machine_id, MachineRun.run_type, MachineRun.result,
                                                func.count(MachineRun.id)).group_by(
                MachineRun.machine_id, MachineRun.run_type, MachineRun.result).all():
            if rtype == RunType.MANUAL_DATA_ENTRY.value:
                b = "manual"
            elif rtype == RunType.REWORK_RUN.value or result in ("FAIL", "REWORK"):
                b = "rework"
            else:
                b = "pass"
            agg.setdefault(mid, {})[b] = agg.get(mid, {}).get(b, 0) + cnt
        queue = dict(db.query(Seatbelt.current_machine_id, func.count(Seatbelt.id))
                     .filter(Seatbelt.current_status != S.COMPLETED.value).group_by(Seatbelt.current_machine_id).all())

        cycle_rows = db.query(MachineRun.machine_id, MachineRun.started_at, MachineRun.completed_at).filter(
            MachineRun.run_type != RunType.MANUAL_DATA_ENTRY.value).all()
        cycles: Dict[int, List[float]] = {}
        for mid, st, en in cycle_rows:
            secs = (en - st).total_seconds()
            if secs > 0:
                cycles.setdefault(mid, []).append(secs)

        throughput, missing_stats = [], []
        for m in machines:
            a = agg.get(m.id, {})
            cyc = cycles.get(m.id)
            throughput.append({
                "machine_id": m.id, "machine_code": m.machine_code, "machine_name": m.machine_name,
                "sequence_number": m.sequence_number,
                "total_processed": sum(a.values()), "pass_count": a.get("pass", 0),
                "rework_count": a.get("rework", 0), "missing_data_count": a.get("manual", 0),
                "current_in_queue": queue.get(m.id, 0),
                "avg_cycle_time_sec": round(sum(cyc) / len(cyc), 1) if cyc else None,
            })
            missing_stats.append({"machine_code": m.machine_code, "machine_name": m.machine_name, "count": a.get("manual", 0)})

        reason_counts = dict(db.query(ReworkHistory.reason, func.count(ReworkHistory.id)).group_by(ReworkHistory.reason).all())
        total_rw = sum(reason_counts.values())
        pareto = [{"reason": r or "Other", "count": c, "percentage": round(c / total_rw * 100, 1)}
                  for r, c in sorted(reason_counts.items(), key=lambda x: x[1], reverse=True)]

        audits = (db.query(AuditLog).options(joinedload(AuditLog.user), joinedload(AuditLog.seatbelt), joinedload(AuditLog.machine))
                  .filter(AuditLog.seatbelt_id.isnot(None))
                  .order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(15).all())
        recent = [{
            "id": a.id, "timestamp": a.created_at,
            "seatbelt_qr": a.seatbelt.qr_code if a.seatbelt else "N/A",
            "machine_code": a.machine.machine_code if a.machine else "SYS", "action": a.action,
            "user_name": a.user.name if a.user else "System", "user_role": a.user.role if a.user else "AUTO",
            "run_type": a.new_data.get("run_type") if isinstance(a.new_data, dict) else None,
            "result": a.new_data.get("result") if isinstance(a.new_data, dict) else None,
            "status": a.new_status or "UPDATED",
        } for a in audits]

        return {
            "kpi_summary": {
                "total_production": total, "completed": completed, "in_progress": in_progress,
                "rework_required": rework, "data_missing": manual_entries, "quality_pending": qa_pending,
                "rejected": rejected, "first_pass_yield": fpy, "active_operators_count": active_ops,
            },
            "machine_throughput": throughput, "rework_pareto": pareto,
            "missing_data_stats": missing_stats, "recent_activities": recent,
        }
