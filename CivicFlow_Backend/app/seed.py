from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.team import Team
from app.models.user import User

DEFAULT_TEAMS = [
    ("North Waste Crew", "Waste Management", "Sector 15", 6),
    ("Central Roads Crew", "Roads & Infrastructure", "Sector 17", 5),
    ("Streetlight Response", "Street Lighting", "Sector 22", 4),
    ("Drainage Field Crew", "Drainage", "Sector 26", 5),
    ("Water Supply Response", "Water Supply", "Sector 34", 4),
    ("Parks Maintenance Crew", "Parks & Public Spaces", "Sector 15", 5),
    ("Civic Safety Review", "Public Safety", None, 3),
    ("General Inspection Crew", "Other / Needs Review", None, 4),
]


def seed(db: Session) -> None:
    for name, department, sector, capacity in DEFAULT_TEAMS:
        if not db.query(Team).filter(Team.name == name).first():
            db.add(Team(name=name, department=department, base_sector=sector, capacity=capacity, is_active=True))
    if settings.bootstrap_admin_email and settings.bootstrap_admin_password:
        email = settings.bootstrap_admin_email.strip().lower()
        admin = db.query(User).filter(User.email == email).first()
        if admin is None:
            db.add(User(
                full_name="CivicFlow Administrator",
                email=email,
                password_hash=hash_password(settings.bootstrap_admin_password),
                role="admin",
                department=None,
                is_active=True,
            ))
        elif admin.role != "admin":
            raise RuntimeError("BOOTSTRAP_ADMIN_EMAIL already exists but is not an administrator; refusing to elevate it automatically.")
    db.commit()


def main() -> None:
    with SessionLocal() as db:
        seed(db)
    print("Seed complete. Default field teams are available.")
    if not (settings.bootstrap_admin_email and settings.bootstrap_admin_password):
        print("No administrator was created. Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, then rerun the seed command.")


if __name__ == "__main__":
    main()
