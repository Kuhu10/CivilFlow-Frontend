import re
import uuid
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.incident import Incident
from app.models.user import User
from app.schemas.incident import DuplicateCandidate

SEVERITY_BASE = {"low": 20, "medium": 40, "high": 65, "critical": 82}


def calculate_priority(severity: str, affected_count: int, safety_risk: bool, description: str) -> int:
    """Transparent triage heuristic; not a prediction of harm or an emergency assessment."""
    score = SEVERITY_BASE.get(severity, 40)
    score += min(max(affected_count, 0) // 25, 12)
    score += 12 if safety_risk else 0
    text = description.lower()
    if any(term in text for term in ("school crossing", "hospital", "moving traffic", "blocked road", "open manhole")):
        score += 5
    return min(100, max(0, int(score)))


def _tokens(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]{3,}", text.lower()) if token not in {"the", "and", "near", "with", "this", "that", "from", "there", "have", "has"}}


def find_duplicate_candidates(db: Session, description: str, sector: str, category: str, limit: int = 5) -> list[DuplicateCandidate]:
    candidates = (
        db.query(Incident)
        .filter(Incident.status.notin_(["closed", "duplicate"]))
        .order_by(Incident.created_at.desc())
        .limit(300)
        .all()
    )
    source_tokens = _tokens(description)
    scored: list[tuple[float, Incident, str]] = []
    for incident in candidates:
        sector_match = incident.sector.strip().casefold() == sector.strip().casefold()
        category_match = incident.category.strip().casefold() == category.strip().casefold()
        if not sector_match and not category_match:
            continue
        target_tokens = _tokens(incident.description)
        union = source_tokens | target_tokens
        jaccard = len(source_tokens & target_tokens) / max(1, len(union))
        sequence = SequenceMatcher(None, description.casefold(), incident.description.casefold()).ratio()
        text_similarity = max(jaccard, sequence * 0.65)
        score = 0.52 * text_similarity + (0.30 if sector_match else 0) + (0.18 if category_match else 0)
        if score >= 0.28:
            reason_parts = []
            if sector_match:
                reason_parts.append("same sector")
            if category_match:
                reason_parts.append("same category")
            if text_similarity >= 0.35:
                reason_parts.append("similar description")
            scored.append((min(score, 0.99), incident, ", ".join(reason_parts)))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        DuplicateCandidate(
            id=incident.id,
            incident_code=incident.incident_code,
            title=incident.title,
            sector=incident.sector,
            status=incident.status,
            category=incident.category,
            similarity_score=round(score, 2),
            reason=reason,
        )
        for score, incident, reason in scored[:limit]
    ]


def record_audit(
    db: Session,
    actor: User | None,
    action: str,
    incident: Incident | None = None,
    old_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> None:
    db.add(AuditLog(
        actor_id=actor.id if actor else None,
        incident_id=incident.id if incident else None,
        action=action,
        old_values=old_values,
        new_values=new_values,
        request_id=request_id,
    ))


def serialize_values(data: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, uuid.UUID):
            output[key] = str(value)
        elif hasattr(value, "isoformat"):
            output[key] = value.isoformat()
        else:
            output[key] = value
    return output
