import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORMBase

Severity = Literal["low", "medium", "high", "critical"]
IssueCategory = Literal["Road Damage", "Waste Overflow", "Streetlight Outage", "Drainage Issue", "Water Supply", "Park Maintenance", "Public Safety", "Other / Needs Review"]
Department = Literal["Roads & Infrastructure", "Waste Management", "Street Lighting", "Drainage", "Water Supply", "Parks & Public Spaces", "Public Safety", "Other / Needs Review"]
IncidentStatus = Literal["open", "assigned", "in_progress", "resolved", "closed", "duplicate"]
EvidenceKind = Literal["before", "after", "other"]
DEPARTMENT_FOR_CATEGORY = {
    "Road Damage": "Roads & Infrastructure",
    "Waste Overflow": "Waste Management",
    "Streetlight Outage": "Street Lighting",
    "Drainage Issue": "Drainage",
    "Water Supply": "Water Supply",
    "Park Maintenance": "Parks & Public Spaces",
    "Public Safety": "Public Safety",
    "Other / Needs Review": "Other / Needs Review",
}


class IncidentAnalysis(BaseModel):
    suggested_title: str = Field(min_length=3, max_length=180)
    summary: str = Field(min_length=8, max_length=500)
    category: IssueCategory = Field(description="One of the approved civic issue categories")
    department: Department = Field(description="The most appropriate responsible municipal department")
    severity: Severity
    safety_risk: bool
    recommended_action: str = Field(min_length=8, max_length=600)
    rationale: str = Field(min_length=8, max_length=600)
    tags: list[str] = Field(default_factory=list, max_length=8)
    provider: str = "rules"
    warnings: list[str] = Field(default_factory=list)


class AIAnalyzeRequest(BaseModel):
    description: str = Field(min_length=10, max_length=5000)
    sector: str | None = Field(default=None, max_length=100)


class IncidentCreate(BaseModel):
    description: str = Field(min_length=10, max_length=5000)
    sector: str = Field(min_length=2, max_length=100)
    title: str | None = Field(default=None, min_length=3, max_length=180)
    category: IssueCategory | None = None
    department: Department | None = None
    severity: Severity | None = None
    safety_risk: bool | None = None
    affected_count: int = Field(default=1, ge=1, le=1000000)
    location_description: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def validate_coordinates(self) -> "IncidentCreate":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be supplied together")
        if self.category and self.department and DEPARTMENT_FOR_CATEGORY.get(self.category) != self.department:
            raise ValueError("department must match the selected category")
        return self


class IncidentPatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=180)
    category: IssueCategory | None = None
    department: Department | None = None
    severity: Severity | None = None
    safety_risk: bool | None = None
    affected_count: int | None = Field(default=None, ge=1, le=1000000)
    sector: str | None = Field(default=None, min_length=2, max_length=100)
    location_description: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    resolution_notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def validate_coordinates(self) -> "IncidentPatch":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be supplied together")
        for field_name in ("title", "category", "department", "severity", "safety_risk", "affected_count", "sector"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        if self.category and self.department and DEPARTMENT_FOR_CATEGORY.get(self.category) != self.department:
            raise ValueError("department must match the selected category")
        return self


class AssignIncidentRequest(BaseModel):
    team_id: uuid.UUID
    assigned_to_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=1000)


class MergeDuplicateRequest(BaseModel):
    target_incident_id: uuid.UUID
    note: str = Field(min_length=3, max_length=1000)


class StatusChangeRequest(BaseModel):
    status: IncidentStatus
    note: str | None = Field(default=None, max_length=1000)


class ClosureVerificationRequest(BaseModel):
    verified: bool
    notes: str = Field(min_length=3, max_length=2000)


class IncidentOut(ORMBase):
    id: uuid.UUID
    incident_code: str
    title: str
    description: str
    summary: str
    category: str
    department: str
    severity: str
    status: str
    priority_score: int
    safety_risk: bool
    affected_count: int
    sector: str
    location_description: str | None
    latitude: float | None
    longitude: float | None
    source: str
    ai_provider: str
    ai_rationale: str
    recommended_action: str
    tags: list[str]
    created_by_id: uuid.UUID
    assigned_team_id: uuid.UUID | None
    assigned_to_id: uuid.UUID | None
    closure_verified: bool
    resolution_notes: str | None
    resolved_at: datetime | None
    merged_into_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class EvidenceOut(ORMBase):
    id: uuid.UUID
    incident_id: uuid.UUID
    uploaded_by_id: uuid.UUID
    kind: str
    original_filename: str
    mime_type: str
    size_bytes: int
    checksum_sha256: str
    note: str | None
    created_at: datetime


class TeamBrief(BaseModel):
    id: uuid.UUID
    name: str
    department: str


class DuplicateCandidate(BaseModel):
    id: uuid.UUID
    incident_code: str
    title: str
    sector: str
    status: str
    category: str
    similarity_score: float
    reason: str


class IncidentCreateResult(BaseModel):
    incident: IncidentOut
    analysis: IncidentAnalysis
    possible_duplicates: list[DuplicateCandidate]
    deduplication_note: str
