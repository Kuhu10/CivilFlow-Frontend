from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.responses import success
from app.db.session import get_db
from app.models.team import Team
from app.models.user import User
from app.schemas.team import TeamCreate, TeamOut, TeamPatch
from app.services.incident_ops import record_audit, serialize_values

router = APIRouter()


@router.get("")
def list_teams(request: Request, active_only: bool = True, department: str | None = None, db: Session = Depends(get_db), user: User = Depends(require_roles("officer", "admin"))):
    query = db.query(Team)
    if active_only:
        query = query.filter(Team.is_active.is_(True))
    if department:
        query = query.filter(Team.department == department)
    teams = query.order_by(Team.department, Team.name).all()
    return success(request, [TeamOut.model_validate(team) for team in teams])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_team(payload: TeamCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    if db.query(Team).filter(Team.name == payload.name.strip()).first():
        raise HTTPException(status_code=409, detail={"code": "TEAM_NAME_EXISTS", "message": "A team with this name already exists."})
    if payload.supervisor_id:
        supervisor = db.get(User, payload.supervisor_id)
        if supervisor is None or supervisor.role not in {"officer", "admin"} or not supervisor.is_active:
            raise HTTPException(status_code=422, detail={"code": "INVALID_SUPERVISOR", "message": "Supervisor must be an active officer or administrator."})
    team = Team(**(payload.model_dump() | {"name": payload.name.strip(), "department": payload.department.strip()}))
    db.add(team)
    db.flush()
    record_audit(db, user, "team.created", new_values={"team_id": str(team.id), "name": team.name, "department": team.department}, request_id=request.state.request_id)
    db.commit()
    db.refresh(team)
    return success(request, TeamOut.model_validate(team))


@router.patch("/{team_id}")
def update_team(team_id: UUID, payload: TeamPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail={"code": "TEAM_NOT_FOUND", "message": "Team was not found."})
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("supervisor_id"):
        supervisor = db.get(User, changes["supervisor_id"])
        if supervisor is None or supervisor.role not in {"officer", "admin"} or not supervisor.is_active:
            raise HTTPException(status_code=422, detail={"code": "INVALID_SUPERVISOR", "message": "Supervisor must be an active officer or administrator."})
    if "name" in changes and changes["name"] != team.name:
        existing = db.query(Team).filter(Team.name == changes["name"], Team.id != team.id).first()
        if existing:
            raise HTTPException(status_code=409, detail={"code": "TEAM_NAME_EXISTS", "message": "A team with this name already exists."})
    old = {"name": team.name, "department": team.department, "is_active": team.is_active, "capacity": team.capacity}
    for key, value in changes.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(team, key, value)
    record_audit(db, user, "team.updated", old_values=old, new_values={"team_id": str(team.id), "changes": serialize_values(changes)}, request_id=request.state.request_id)
    db.commit()
    db.refresh(team)
    return success(request, TeamOut.model_validate(team), {"previous": old})
