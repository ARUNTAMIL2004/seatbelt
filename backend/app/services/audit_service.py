from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session, joinedload
from app.models.models import AuditLog


def audit_to_dict(l: AuditLog, include_ip: bool = True) -> Dict[str, Any]:
    d = {
        "id": l.id,
        "user_id": l.user_id,
        "user_name": l.user.name if l.user else "System",
        "user_employee_id": l.user.employee_id if l.user else "AUTO",
        "user_role": l.user.role if l.user else "SYSTEM",
        "seatbelt_id": l.seatbelt_id,
        "seatbelt_qr": l.seatbelt.qr_code if l.seatbelt else None,
        "machine_id": l.machine_id,
        "machine_code": l.machine.machine_code if l.machine else None,
        "action": l.action,
        "old_status": l.old_status,
        "new_status": l.new_status,
        "old_data": l.old_data,
        "new_data": l.new_data,
        "reason": l.reason,
        "created_at": l.created_at,
    }
    if include_ip:
        d["ip_address"] = l.ip_address
    return d


class AuditService:
    @staticmethod
    def log_action(
        db: Session,
        action: str,
        user_id: Optional[int] = None,
        seatbelt_id: Optional[int] = None,
        machine_id: Optional[int] = None,
        old_status: Optional[str] = None,
        new_status: Optional[str] = None,
        old_data: Optional[Dict[str, Any]] = None,
        new_data: Optional[Dict[str, Any]] = None,
        reason: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        """Append an audit record to the *current transaction*.

        It is deliberately NOT committed here: callers commit once so the business change and
        its audit record are atomic (both persist or neither does).
        """
        audit = AuditLog(
            user_id=user_id, seatbelt_id=seatbelt_id, machine_id=machine_id, action=action,
            old_status=old_status, new_status=new_status, old_data=old_data, new_data=new_data,
            reason=reason, ip_address=ip_address,
        )
        db.add(audit)
        db.flush()
        return audit

    @staticmethod
    def _base_query(db: Session):
        return db.query(AuditLog).options(
            joinedload(AuditLog.user), joinedload(AuditLog.seatbelt), joinedload(AuditLog.machine)
        )

    @staticmethod
    def get_logs_for_seatbelt(db: Session, seatbelt_id: int) -> List[AuditLog]:
        return (AuditService._base_query(db).filter(AuditLog.seatbelt_id == seatbelt_id)
                .order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).all())

    @staticmethod
    def get_all_logs(db: Session, limit: int = 200, offset: int = 0, action: Optional[str] = None,
                     q: Optional[str] = None):
        query = AuditService._base_query(db)
        if action:
            query = query.filter(AuditLog.action == action)
        total_q = db.query(AuditLog)
        if action:
            total_q = total_q.filter(AuditLog.action == action)
        total = total_q.count()
        rows = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(offset).limit(limit).all()
        return rows, total
