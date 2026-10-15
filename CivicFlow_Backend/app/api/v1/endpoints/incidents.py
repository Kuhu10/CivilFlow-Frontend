import hashlib
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_roles
from app.api.responses import success
from app.core.config import settings
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.evidence import Evidence
from app.models.incident import Incident
from app.models.team import Team
from app.models.user import User
from app.schemas.incident import (
    AssignIncidentRequest,
    ClosureVerificationRequest,
    EvidenceOut,
    IncidentAnalysis,
    IncidentCreate,
    IncidentCreateResult,
    IncidentOut,
    IncidentPatch,
    MergeDuplicateRequest,
    StatusChangeRequest,
)
from app.services.ai_service import analyze_incident, validate_image_bytes
from app.services.incident_ops import calculate_priority, find_duplicate_candidates, record_audit, serialize_values

router = APIRouter()

DEPARTMENT_BY_CATEGORY = {
    "Road Damage": "Roads & Infrastructure",
    "Waste Overflow": "Waste Management",
    "Streetlight Outage": "Street Lighting",
    "Drainage Issue": "Drainage",
    "Water Supply": "Water Supply",
    "Park Maintenance": "Parks & Public Spaces",
    "Public Safety": "Public Safety",
    "Other / Needs Review": "Other / Needs Review",
}
VALID_TRANSITIONS = {
    "open": {"assigned", "in_progress"},
    "assigned": {"open", "in_progress"},
    "in_progress": {"assigned", "resolved"},
    "resolved": {"closed", "in_progress"},
    "closed": {"in_progress"},
    "duplicate": set(),
}


def _incident_or_404(db: Session, incident_id: uuid.UUID) -> Incident:
    incident = db.query(Incident).options(joinedload(Incident.evidence)).filter(Incident.id == incident_id).first()
    if incident is None:
        raise HTTPException(status_code=404, detail={"code": "INCIDENT_NOT_FOUND", "message": "Incident was not found."})
    return incident


def _authorize_incident(incident: Incident, user: User) -> None:
    if user.role == "citizen" and incident.created_by_id != user.id:
        raise HTTPException(status_code=404, detail={"code": "INCIDENT_NOT_FOUND", "message": "Incident was not found."})


def _incident_snapshot(incident: Incident) -> dict:
    return {
        "status": incident.status,
        "severity": incident.severity,
        "department": incident.department,
        "assigned_team_id": str(incident.assigned_team_id) if incident.assigned_team_id else None,
        "assigned_to_id": str(incident.assigned_to_id) if incident.assigned_to_id else None,
        "closure_verified": incident.closure_verified,
        "priority_score": incident.priority_score,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_incident(payload: IncidentCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    analysis = analyze_incident(payload.description)
    category = payload.category or analysis.category
    department = payload.department or DEPARTMENT_BY_CATEGORY.get(category, analysis.department) or "Other / Needs Review"
    severity = payload.severity or analysis.severity
    safety_risk = payload.safety_risk if payload.safety_risk is not None else analysis.safety_risk
    title = payload.title or analysis.suggested_title
    possible_duplicates = find_duplicate_candidates(db, payload.description, payload.sector, category)
    stamp = datetime.now(timezone.utc).strftime("%y%m%d")
    incident = Incident(
        incident_code=f"CF-{stamp}-{uuid.uuid4().hex[:6].upper()}",
        title=title.strip(), description=payload.description.strip(), summary=analysis.summary,
        category=category, department=department, severity=severity,
        status="open", priority_score=calculate_priority(severity, payload.affected_count, safety_risk, payload.description),
        safety_risk=safety_risk, affected_count=payload.affected_count, sector=payload.sector.strip(),
        location_description=payload.location_description, latitude=payload.latitude, longitude=payload.longitude,
        source="citizen" if user.role == "citizen" else "staff",
        ai_provider=analysis.provider, ai_rationale=analysis.rationale,
        recommended_action=analysis.recommended_action, tags=analysis.tags,
        created_by_id=user.id,
    )
    db.add(incident)
    db.flush()
    record_audit(db, user, "incident.created", incident, new_values={"incident_code": incident.incident_code, "status": "open", "severity": severity, "priority_score": incident.priority_score}, request_id=request.state.request_id)
    db.commit()
    db.refresh(incident)
    result = IncidentCreateResult(
        incident=IncidentOut.model_validate(incident), analysis=analysis,
        possible_duplicates=possible_duplicates,
        deduplication_note="Possible duplicates are suggestions for a human reviewer. No records were merged automatically.",
    )
    return success(request, result)


@router.get("")
def list_incidents(
    request: Request,
    status_filter: str | None = Query(default=None, alias="status", pattern="^(open|assigned|in_progress|resolved|closed|duplicate)$"),
    severity: str | None = Query(default=None, pattern="^(low|medium|high|critical)$"),
    department: str | None = Query(default=None, max_length=100),
    category: str | None = Query(default=None, max_length=80),
    sector: str | None = Query(default=None, max_length=100),
    q: str | None = Query(default=None, max_length=200),
    assigned: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    query = db.query(Incident)
    if user.role == "citizen":
        query = query.filter(Incident.created_by_id == user.id)
    if status_filter:
        query = query.filter(Incident.status == status_filter)
    if severity:
        query = query.filter(Incident.severity == severity)
    if department:
        query = query.filter(Incident.department == department)
    if category:
        query = query.filter(Incident.category == category)
    if sector:
        query = query.filter(Incident.sector.ilike(f"%{sector}%"))
    if assigned is True:
        query = query.filter(Incident.assigned_team_id.is_not(None))
    elif assigned is False:
        query = query.filter(Incident.assigned_team_id.is_(None))
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(Incident.incident_code.ilike(term), Incident.title.ilike(term), Incident.description.ilike(term)))
    total = query.count()
    rows = query.order_by(Incident.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return success(request, [IncidentOut.model_validate(item) for item in rows], {"pagination": {"page": page, "page_size": page_size, "total": total, "pages": (total + page_size - 1) // page_size}})


@router.get("/{incident_id}")
def get_incident(incident_id: uuid.UUID, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    incident = _incident_or_404(db, incident_id)
    _authorize_incident(incident, user)
    return success(request, IncidentOut.model_validate(incident))


@router.patch("/{incident_id}")
def update_incident(
    incident_id: uuid.UUID, payload: IncidentPatch, request: Request,
    db: Session = Depends(get_db), user: User = Depends(require_roles("officer", "admin")),
):
    incident = _incident_or_404(db, incident_id)
    old = _incident_snapshot(incident)
    changes = payload.model_dump(exclude_unset=True)
    if "category" in changes and "department" not in changes:
        changes["department"] = DEPARTMENT_BY_CATEGORY.get(changes["category"], incident.department)
    resulting_category = changes.get("category", incident.category)
    resulting_department = changes.get("department", incident.department)
    expected_department = DEPARTMENT_BY_CATEGORY.get(resulting_category, "Other / Needs Review")
    if resulting_department != expected_department:
        raise HTTPException(status_code=422, detail={"code": "CATEGORY_DEPARTMENT_MISMATCH", "message": "Department must match the selected incident category."})
    for key, value in changes.items():
        setattr(incident, key, value)
    incident.priority_score = calculate_priority(incident.severity, incident.affected_count, incident.safety_risk, incident.description)
    incident.updated_at = datetime.now(timezone.utc)
    record_audit(db, user, "incident.updated", incident, old_values=old, new_values=serialize_values(changes), request_id=request.state.request_id)
    db.commit()
    db.refresh(incident)
    return success(request, IncidentOut.model_validate(incident))


@router.post("/{incident_id}/assign")
def assign_incident(
    incident_id: uuid.UUID, payload: AssignIncidentRequest, request: Request,
    db: Session = Depends(get_db), user: User = Depends(require_roles("officer", "admin")),
):
    incident = _incident_or_404(db, incident_id)
    if incident.status in {"closed", "duplicate"}:
        raise HTTPException(status_code=409, detail={"code": "INCIDENT_NOT_ASSIGNABLE", "message": "Closed or duplicate incidents cannot be assigned."})
    team = db.get(Team, payload.team_id)
    if team is None or not team.is_active:
        raise HTTPException(status_code=404, detail={"code": "TEAM_NOT_FOUND", "message": "Active field team was not found."})
    if team.department not in {incident.department, "Other / Needs Review"}:
        raise HTTPException(status_code=422, detail={"code": "DEPARTMENT_MISMATCH", "message": "Team department does not match the incident department."})
    assignee = None
    if payload.assigned_to_id:
        assignee = db.get(User, payload.assigned_to_id)
        if assignee is None or not assignee.is_active or assignee.role not in {"officer", "admin"}:
            raise HTTPException(status_code=422, detail={"code": "INVALID_ASSIGNEE", "message": "Assignee must be an active officer or administrator."})
        if assignee.department and assignee.department != incident.department and assignee.role != "admin":
            raise HTTPException(status_code=422, detail={"code": "ASSIGNEE_DEPARTMENT_MISMATCH", "message": "Assignee belongs to another department."})
    old = _incident_snapshot(incident)
    incident.assigned_team_id = team.id
    incident.assigned_to_id = assignee.id if assignee else None
    if incident.status == "open":
        incident.status = "assigned"
    incident.updated_at = datetime.now(timezone.utc)
    record_audit(db, user, "incident.assigned", incident, old_values=old, new_values={"team_id": str(team.id), "team_name": team.name, "assigned_to_id": str(assignee.id) if assignee else None, "note": payload.note}, request_id=request.state.request_id)
    db.commit()
    db.refresh(incident)
    return success(request, IncidentOut.model_validate(incident))


@router.post("/{incident_id}/merge-duplicate")
def merge_duplicate(
    incident_id: uuid.UUID, payload: MergeDuplicateRequest, request: Request,
    db: Session = Depends(get_db), user: User = Depends(require_roles("officer", "admin")),
):
    source = _incident_or_404(db, incident_id)
    target = _incident_or_404(db, payload.target_incident_id)
    if source.id == target.id:
        raise HTTPException(status_code=422, detail={"code": "SELF_MERGE_NOT_ALLOWED", "message": "An incident cannot be merged into itself."})
    if source.status in {"closed", "duplicate"}:
        raise HTTPException(status_code=409, detail={"code": "SOURCE_NOT_MERGEABLE", "message": "Closed or already-duplicate incidents cannot be merged."})
    if target.status in {"closed", "duplicate"}:
        raise HTTPException(status_code=409, detail={"code": "TARGET_NOT_CANONICAL", "message": "Choose an active canonical incident."})
    if source.sector.casefold() != target.sector.casefold() and source.category.casefold() != target.category.casefold():
        raise HTTPException(status_code=422, detail={"code": "DUPLICATE_MISMATCH", "message": "The incidents need a matching sector or category before they can be linked as duplicates."})
    source_old = {"status": source.status, "merged_into_id": str(source.merged_into_id) if source.merged_into_id else None}
    source.status = "duplicate"
    source.merged_into_id = target.id
    source.updated_at = datetime.now(timezone.utc)
    record_audit(db, user, "incident.merged_as_duplicate", source, old_values=source_old, new_values={"status": "duplicate", "merged_into_id": str(target.id), "note": payload.note}, request_id=request.state.request_id)
    record_audit(db, user, "incident.duplicate_linked", target, new_values={"duplicate_incident_id": str(source.id), "note": payload.note}, request_id=request.state.request_id)
    db.commit()
    db.refresh(source)
    db.refresh(target)
    return success(request, {"duplicate_incident": IncidentOut.model_validate(source), "canonical_incident": IncidentOut.model_validate(target), "note": "Evidence and audit history remain attached to the original incident record."})


@router.post("/{incident_id}/status")
def change_status(
    incident_id: uuid.UUID, payload: StatusChangeRequest, request: Request,
    db: Session = Depends(get_db), user: User = Depends(require_roles("officer", "admin")),
):
    incident = _incident_or_404(db, incident_id)
    old_status = incident.status
    old = _incident_snapshot(incident)
    if payload.status == old_status:
        return success(request, IncidentOut.model_validate(incident), {"message": "Status was unchanged."})
    if payload.status == "duplicate":
        raise HTTPException(status_code=422, detail={"code": "USE_MERGE_DUPLICATE", "message": "Use the merge-duplicate endpoint and specify the canonical incident ID."})
    if payload.status not in VALID_TRANSITIONS.get(old_status, set()):
        raise HTTPException(status_code=409, detail={"code": "INVALID_STATUS_TRANSITION", "message": f"Cannot change status from {old_status} to {payload.status}.", "allowed_next_statuses": sorted(VALID_TRANSITIONS.get(old_status, set()))})
    if old_status == "closed" and user.role != "admin":
        raise HTTPException(status_code=403, detail={"code": "ADMIN_REOPEN_REQUIRED", "message": "Only an administrator can reopen a closed incident."})
    if payload.status == "resolved":
        has_after = any(item.kind == "after" for item in incident.evidence)
        if not incident.closure_verified or not has_after:
            raise HTTPException(status_code=409, detail={"code": "RESOLUTION_EVIDENCE_REQUIRED", "message": "Upload after-resolution evidence and verify closure before marking this incident resolved."})
        incident.resolved_at = datetime.now(timezone.utc)
        if payload.note:
            incident.resolution_notes = payload.note
    elif payload.status == "closed":
        if not incident.closure_verified:
            raise HTTPException(status_code=409, detail={"code": "CLOSURE_NOT_VERIFIED", "message": "Closure must be verified before closing the work order."})
    elif payload.status == "in_progress" and old_status in {"resolved", "closed"}:
        incident.resolved_at = None
        incident.closure_verified = False
        if payload.note:
            incident.resolution_notes = payload.note
    incident.status = payload.status
    incident.updated_at = datetime.now(timezone.utc)
    record_audit(db, user, "incident.status_changed", incident, old_values=old, new_values={"status": payload.status, "note": payload.note}, request_id=request.state.request_id)
    db.commit()
    db.refresh(incident)
    return success(request, IncidentOut.model_validate(incident))


@router.post("/{incident_id}/verify-closure")
def verify_closure(
    incident_id: uuid.UUID, payload: ClosureVerificationRequest, request: Request,
    db: Session = Depends(get_db), user: User = Depends(require_roles("officer", "admin")),
):
    incident = _incident_or_404(db, incident_id)
    if incident.status in {"closed", "duplicate"}:
        raise HTTPException(status_code=409, detail={"code": "VERIFICATION_NOT_ALLOWED", "message": "This incident cannot be verified in its current status."})
    if payload.verified and not any(item.kind == "after" for item in incident.evidence):
        raise HTTPException(status_code=409, detail={"code": "AFTER_EVIDENCE_REQUIRED", "message": "Upload an after-resolution image before verifying closure."})
    old = {"closure_verified": incident.closure_verified, "resolution_notes": incident.resolution_notes}
    incident.closure_verified = payload.verified
    incident.resolution_notes = payload.notes
    incident.updated_at = datetime.now(timezone.utc)
    record_audit(db, user, "incident.closure_verified" if payload.verified else "incident.closure_rejected", incident, old_values=old, new_values={"closure_verified": payload.verified, "notes": payload.notes}, request_id=request.state.request_id)
    db.commit()
    db.refresh(incident)
    return success(request, IncidentOut.model_validate(incident))


@router.post("/{incident_id}/evidence", status_code=status.HTTP_201_CREATED)
def upload_evidence(
    incident_id: uuid.UUID, request: Request,
    kind: Literal["before", "after", "other"] = Form(...),
    note: str | None = Form(default=None, max_length=2000),
    file: UploadFile = File(...),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    incident = _incident_or_404(db, incident_id)
    _authorize_incident(incident, user)
    max_bytes = settings.max_upload_mb * 1024 * 1024
    raw = file.file.read(max_bytes + 1)
    if not raw:
        raise HTTPException(status_code=400, detail={"code": "EMPTY_UPLOAD", "message": "The uploaded file is empty."})
    if len(raw) > max_bytes:
        raise HTTPException(status_code=413, detail={"code": "FILE_TOO_LARGE", "message": f"Upload exceeds the {settings.max_upload_mb} MB limit."})
    try:
        mime_type, _, _ = validate_image_bytes(raw)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail={"code": "INVALID_IMAGE", "message": str(exc)}) from exc
    extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[mime_type]
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename or "evidence").name)[:200] or "evidence"
    storage_key = f"{incident.id}/{uuid.uuid4().hex}{extension}"
    root = settings.upload_dir.resolve()
    target = (root / storage_key).resolve()
    if root not in target.parents:
        raise HTTPException(status_code=400, detail={"code": "INVALID_STORAGE_PATH", "message": "Invalid upload path."})
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    evidence = Evidence(
        incident_id=incident.id, uploaded_by_id=user.id, kind=kind,
        original_filename=safe_name, storage_key=storage_key, mime_type=mime_type,
        size_bytes=len(raw), checksum_sha256=hashlib.sha256(raw).hexdigest(), note=note,
    )
    db.add(evidence)
    record_audit(db, user, "incident.evidence_uploaded", incident, new_values={"kind": kind, "filename": safe_name, "size_bytes": len(raw)}, request_id=request.state.request_id)
    try:
        db.commit()
    except Exception:
        target.unlink(missing_ok=True)
        db.rollback()
        raise
    db.refresh(evidence)
    return success(request, EvidenceOut.model_validate(evidence))


@router.get("/{incident_id}/evidence")
def list_evidence(incident_id: uuid.UUID, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    incident = _incident_or_404(db, incident_id)
    _authorize_incident(incident, user)
    rows = db.query(Evidence).filter(Evidence.incident_id == incident.id).order_by(Evidence.created_at.asc()).all()
    data = [EvidenceOut.model_validate(item).model_dump(mode="json") | {"download_path": f"/api/v1/incidents/{incident.id}/evidence/{item.id}/download"} for item in rows]
    return success(request, data)


@router.get("/{incident_id}/evidence/{evidence_id}/download", include_in_schema=True)
def download_evidence(incident_id: uuid.UUID, evidence_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    incident = _incident_or_404(db, incident_id)
    _authorize_incident(incident, user)
    item = db.query(Evidence).filter(Evidence.id == evidence_id, Evidence.incident_id == incident.id).first()
    if item is None:
        raise HTTPException(status_code=404, detail={"code": "EVIDENCE_NOT_FOUND", "message": "Evidence was not found."})
    root = settings.upload_dir.resolve()
    path = (root / item.storage_key).resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail={"code": "EVIDENCE_FILE_MISSING", "message": "Stored evidence file was not found."})
    return FileResponse(path, media_type=item.mime_type, filename=item.original_filename, headers={"Cache-Control": "private, no-store"})


@router.get("/{incident_id}/timeline")
def incident_timeline(incident_id: uuid.UUID, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    incident = _incident_or_404(db, incident_id)
    _authorize_incident(incident, user)
    rows = db.query(AuditLog).filter(AuditLog.incident_id == incident.id).order_by(AuditLog.created_at.desc()).limit(100).all()
    events = [{"id": row.id, "actor_id": row.actor_id, "action": row.action, "old_values": row.old_values, "new_values": row.new_values, "request_id": row.request_id, "created_at": row.created_at} for row in rows]
    return success(request, events)
