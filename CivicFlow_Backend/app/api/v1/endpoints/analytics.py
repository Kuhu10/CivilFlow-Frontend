from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.responses import success
from app.db.session import get_db
from app.models.incident import Incident
from app.models.user import User

router = APIRouter()


@router.get("/overview")
def overview(request: Request, db: Session = Depends(get_db), user: User = Depends(require_roles("officer", "admin"))):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    total = db.query(func.count(Incident.id)).scalar() or 0
    open_count = db.query(func.count(Incident.id)).filter(Incident.status.in_(["open", "assigned", "in_progress"])).scalar() or 0
    priority_count = db.query(func.count(Incident.id)).filter(Incident.status.in_(["open", "assigned", "in_progress"]), Incident.severity.in_(["high", "critical"])).scalar() or 0
    unassigned_count = db.query(func.count(Incident.id)).filter(Incident.status.in_(["open", "assigned"]), Incident.assigned_team_id.is_(None)).scalar() or 0
    resolved_week = db.query(func.count(Incident.id)).filter(Incident.resolved_at >= week_ago).scalar() or 0
    status_rows = db.query(Incident.status, func.count(Incident.id)).group_by(Incident.status).all()
    department_rows = db.query(Incident.department, func.count(Incident.id)).group_by(Incident.department).order_by(func.count(Incident.id).desc()).all()
    sector_rows = db.query(Incident.sector, func.count(Incident.id)).group_by(Incident.sector).order_by(func.count(Incident.id).desc()).limit(12).all()
    severity_rows = db.query(Incident.severity, func.count(Incident.id)).group_by(Incident.severity).all()
    data = {
        "total_incidents": total,
        "active_incidents": open_count,
        "high_or_critical_active": priority_count,
        "unassigned_active": unassigned_count,
        "resolved_last_7_days": resolved_week,
        "status_breakdown": [{"status": label, "count": count} for label, count in status_rows],
        "severity_breakdown": [{"severity": label, "count": count} for label, count in severity_rows],
        "department_breakdown": [{"department": label, "count": count} for label, count in department_rows],
        "top_sectors": [{"sector": label, "count": count} for label, count in sector_rows],
        "as_of": now,
        "notice": "Counts come from this database; no live municipal-system feed is connected by default.",
    }
    return success(request, data)
