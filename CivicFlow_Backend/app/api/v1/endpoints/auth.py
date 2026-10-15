from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.responses import success
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, StaffRegister, TokenData, UserActiveUpdate, UserPrivilegeUpdate, UserRead, UserRegister
from app.services.incident_ops import record_audit

router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, request: Request, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail={"code": "EMAIL_ALREADY_REGISTERED", "message": "An account already exists for this email."})
    user = User(full_name=payload.full_name.strip(), email=email, password_hash=hash_password(payload.password), role="citizen")
    db.add(user)
    db.flush()
    record_audit(db, user, "user.registered", new_values={"email": email, "role": "citizen"}, request_id=request.state.request_id)
    db.commit()
    db.refresh(user)
    return success(request, UserRead.model_validate(user))


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail={"code": "INVALID_CREDENTIALS", "message": "Email or password is incorrect."}, headers={"WWW-Authenticate": "Bearer"})
    token, expires_in = create_access_token(str(user.id), user.role)
    return success(request, TokenData(access_token=token, expires_in=expires_in, user=UserRead.model_validate(user)))


@router.get("/me")
def me(request: Request, user: User = Depends(get_current_user)):
    return success(request, UserRead.model_validate(user))


@router.get("/staff")
def list_staff(request: Request, db: Session = Depends(get_db), user: User = Depends(require_roles("officer", "admin"))):
    staff = db.query(User).filter(User.role.in_(["officer", "admin"]), User.is_active.is_(True)).order_by(User.department, User.full_name).all()
    return success(request, [UserRead.model_validate(item) for item in staff])


@router.post("/staff", status_code=status.HTTP_201_CREATED)
def create_staff(payload: StaffRegister, request: Request, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    email = str(payload.email).strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail={"code": "EMAIL_ALREADY_REGISTERED", "message": "An account already exists for this email."})
    staff = User(full_name=payload.full_name.strip(), email=email, password_hash=hash_password(payload.password), role="officer", department=payload.department.strip())
    db.add(staff)
    db.flush()
    record_audit(db, user, "staff.created", new_values={"staff_id": str(staff.id), "email": email, "department": staff.department, "role": "officer"}, request_id=request.state.request_id)
    db.commit()
    db.refresh(staff)
    return success(request, UserRead.model_validate(staff))


@router.patch("/staff/{user_id}/active")
def set_staff_active(user_id: UUID, payload: UserActiveUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    staff = db.get(User, user_id)
    if staff is None or staff.role not in {"officer", "admin"}:
        raise HTTPException(status_code=404, detail={"code": "STAFF_NOT_FOUND", "message": "Staff account was not found."})
    if staff.id == user.id and not payload.is_active:
        raise HTTPException(status_code=409, detail={"code": "SELF_DEACTIVATION_BLOCKED", "message": "An administrator cannot deactivate their own current account."})
    old = {"is_active": staff.is_active}
    staff.is_active = payload.is_active
    record_audit(db, user, "staff.active_changed", old_values=old, new_values={"staff_id": str(staff.id), "is_active": staff.is_active}, request_id=request.state.request_id)
    db.commit()
    db.refresh(staff)
    return success(request, UserRead.model_validate(staff))


@router.get("/users")
def list_users(
    request: Request,
    q: str | None = None,
    role: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("superadmin")),
):
    query = db.query(User)
    if role and role.strip():
        query = query.filter(User.role == role.strip())
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.filter(User.email.ilike(term) | User.full_name.ilike(term))
    users = query.order_by(User.role.desc(), User.created_at.desc()).all()
    return success(request, [UserRead.model_validate(item) for item in users])


@router.post("/users/privilege")
def update_user_privilege(
    payload: UserPrivilegeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("superadmin")),
):
    email = str(payload.email).strip().lower()
    target = db.query(User).filter(User.email == email).first()
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "USER_NOT_FOUND", "message": f"No account found with email '{email}'. The user must register first before permissions can be assigned or revoked."},
        )
    if target.id == user.id and payload.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "SELF_REVOKE_BLOCKED", "message": "A superadministrator cannot revoke their own superadministrator privilege."},
        )
    old = {"role": target.role, "department": target.department}
    target.role = payload.role
    if payload.department is not None:
        target.department = payload.department.strip() or None
    elif payload.role == "citizen":
        target.department = None
    record_audit(
        db,
        user,
        "user.privilege_changed",
        old_values=old,
        new_values={"user_id": str(target.id), "email": target.email, "role": target.role, "department": target.department},
        request_id=request.state.request_id,
    )
    db.commit()
    db.refresh(target)
    return success(request, UserRead.model_validate(target))


@router.patch("/users/{user_id}/status")
def set_user_status(
    user_id: UUID,
    payload: UserActiveUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("superadmin")),
):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User account was not found."})
    if target.id == user.id and not payload.is_active:
        raise HTTPException(status_code=409, detail={"code": "SELF_DEACTIVATION_BLOCKED", "message": "A superadministrator cannot deactivate their own current account."})
    old = {"is_active": target.is_active}
    target.is_active = payload.is_active
    record_audit(
        db,
        user,
        "user.active_changed",
        old_values=old,
        new_values={"user_id": str(target.id), "is_active": target.is_active},
        request_id=request.state.request_id,
    )
    db.commit()
    db.refresh(target)
    return success(request, UserRead.model_validate(target))

