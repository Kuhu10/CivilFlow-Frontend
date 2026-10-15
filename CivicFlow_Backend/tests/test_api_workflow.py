from collections.abc import Generator
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.team import Team
from app.models.user import User


@pytest.fixture
def client(tmp_path, monkeypatch) -> Generator[TestClient, None, None]:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(settings, "upload_dir", tmp_path / "uploads")
    monkeypatch.setattr(settings, "ai_provider", "rules")
    monkeypatch.setattr(settings, "secret_key", "integration-test-secret-not-for-production-123456")
    with TestingSessionLocal() as db:
        db.add(User(
            full_name="Test Administrator",
            email="admin@example.com",
            password_hash=hash_password("Admin-test-password-123!"),
            role="admin",
            is_active=True,
        ))
        db.add(User(
            full_name="Super Administrator",
            email="superadmin@example.com",
            password_hash=hash_password("SuperAdmin-test-123!"),
            role="superadmin",
            is_active=True,
        ))
        db.add(Team(
            name="Test Roads Crew",
            department="Roads & Infrastructure",
            base_sector="Sector 17",
            capacity=5,
            is_active=True,
        ))
        db.commit()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


def test_incident_assignment_evidence_and_closure_workflow(client: TestClient):
    registered = client.post("/api/v1/auth/register", json={
        "full_name": "Test Citizen", "email": "citizen@example.com", "password": "Citizen-test-password-123!"
    })
    assert registered.status_code == 201, registered.text
    citizen_headers = _login(client, "citizen@example.com", "Citizen-test-password-123!")
    admin_headers = _login(client, "admin@example.com", "Admin-test-password-123!")

    created = client.post("/api/v1/incidents", headers=citizen_headers, json={
        "description": "A deep pothole near the Sector 17 crossing makes two-wheelers swerve into moving traffic.",
        "sector": "Sector 17", "affected_count": 25,
    })
    assert created.status_code == 201, created.text
    payload = created.json()["data"]
    incident_id = payload["incident"]["id"]
    assert payload["incident"]["category"] == "Road Damage"
    assert payload["analysis"]["provider"] == "rules"
    assert payload["possible_duplicates"] == []

    # No after evidence and human verification means resolution is blocked.
    rejected_resolve = client.post(f"/api/v1/incidents/{incident_id}/status", headers=admin_headers, json={"status": "resolved"})
    assert rejected_resolve.status_code == 409

    teams = client.get("/api/v1/teams", headers=admin_headers)
    team = next(t for t in teams.json()["data"] if t["name"] == "Test Roads Crew")
    assigned = client.post(f"/api/v1/incidents/{incident_id}/assign", headers=admin_headers, json={"team_id": team["id"]})
    assert assigned.status_code == 200, assigned.text
    in_progress = client.post(f"/api/v1/incidents/{incident_id}/status", headers=admin_headers, json={"status": "in_progress"})
    assert in_progress.status_code == 200, in_progress.text

    buffer = BytesIO()
    Image.new("RGB", (16, 16), "white").save(buffer, format="PNG")
    evidence = client.post(
        f"/api/v1/incidents/{incident_id}/evidence",
        headers=citizen_headers,
        data={"kind": "after", "note": "synthetic test evidence"},
        files={"file": ("after.png", buffer.getvalue(), "image/png")},
    )
    assert evidence.status_code == 201, evidence.text
    verified = client.post(f"/api/v1/incidents/{incident_id}/verify-closure", headers=admin_headers, json={"verified": True, "notes": "Reviewed test image"})
    assert verified.status_code == 200, verified.text
    resolved = client.post(f"/api/v1/incidents/{incident_id}/status", headers=admin_headers, json={"status": "resolved"})
    assert resolved.status_code == 200, resolved.text
    closed = client.post(f"/api/v1/incidents/{incident_id}/status", headers=admin_headers, json={"status": "closed"})
    assert closed.status_code == 200, closed.text
    assert closed.json()["data"]["status"] == "closed"

    stats = client.get("/api/v1/analytics/overview", headers=admin_headers)
    assert stats.status_code == 200, stats.text
    assert stats.json()["data"]["total_incidents"] == 1


def test_possible_duplicate_needs_human_merge_and_citizens_cannot_see_other_cases(client: TestClient):
    first_user = client.post("/api/v1/auth/register", json={"full_name": "Citizen One", "email": "one@example.com", "password": "Citizen-one-password-123!"})
    second_user = client.post("/api/v1/auth/register", json={"full_name": "Citizen Two", "email": "two@example.com", "password": "Citizen-two-password-123!"})
    assert first_user.status_code == second_user.status_code == 201
    first_headers = _login(client, "one@example.com", "Citizen-one-password-123!")
    second_headers = _login(client, "two@example.com", "Citizen-two-password-123!")
    admin_headers = _login(client, "admin@example.com", "Admin-test-password-123!")
    payload_a = {"description": "Garbage is overflowing from the bin near the Sector 17 market crossing.", "sector": "Sector 17"}
    payload_b = {"description": "A bin has overflowing garbage at the Sector 17 market crossing.", "sector": "Sector 17"}
    first = client.post("/api/v1/incidents", headers=first_headers, json=payload_a).json()["data"]["incident"]
    second = client.post("/api/v1/incidents", headers=second_headers, json=payload_b).json()["data"]
    assert second["possible_duplicates"], second
    source_id = second["incident"]["id"]
    canonical_id = first["id"]
    assert client.get(f"/api/v1/incidents/{source_id}", headers=first_headers).status_code == 404
    merged = client.post(f"/api/v1/incidents/{source_id}/merge-duplicate", headers=admin_headers, json={"target_incident_id": canonical_id, "note": "Staff reviewed and linked duplicate reports."})
    assert merged.status_code == 200, merged.text
    assert merged.json()["data"]["duplicate_incident"]["merged_into_id"] == canonical_id
    assert merged.json()["data"]["duplicate_incident"]["status"] == "duplicate"


def test_superadmin_user_privilege_management(client: TestClient):
    admin_headers = _login(client, "admin@example.com", "Admin-test-password-123!")
    superadmin_headers = _login(client, "superadmin@example.com", "SuperAdmin-test-123!")

    # Verify standard admin CANNOT access user privilege management
    admin_denied = client.get("/api/v1/auth/users", headers=admin_headers)
    assert admin_denied.status_code == 403

    reg = client.post("/api/v1/auth/register", json={"full_name": "Citizen Three", "email": "three@example.com", "password": "Password-123!"})
    assert reg.status_code == 201

    # Only superadmin can list users
    users_res = client.get("/api/v1/auth/users", headers=superadmin_headers)
    assert users_res.status_code == 200
    emails = [u["email"] for u in users_res.json()["data"]]
    assert "three@example.com" in emails

    # Only superadmin can elevate roles
    grant_res = client.post("/api/v1/auth/users/privilege", headers=superadmin_headers, json={"email": "three@example.com", "role": "admin"})
    assert grant_res.status_code == 200
    assert grant_res.json()["data"]["role"] == "admin"

    # Only superadmin can revoke privileges
    revoke_res = client.post("/api/v1/auth/users/privilege", headers=superadmin_headers, json={"email": "three@example.com", "role": "citizen"})
    assert revoke_res.status_code == 200
    assert revoke_res.json()["data"]["role"] == "citizen"

