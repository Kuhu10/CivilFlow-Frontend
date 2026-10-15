import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMBase


class TeamCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    department: str = Field(min_length=2, max_length=100)
    base_sector: str | None = Field(default=None, max_length=80)
    supervisor_id: uuid.UUID | None = None
    capacity: int = Field(default=5, ge=1, le=100)


class TeamPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    department: str | None = Field(default=None, min_length=2, max_length=100)
    base_sector: str | None = Field(default=None, max_length=80)
    supervisor_id: uuid.UUID | None = None
    capacity: int | None = Field(default=None, ge=1, le=100)
    is_active: bool | None = None


class TeamOut(ORMBase):
    id: uuid.UUID
    name: str
    department: str
    base_sector: str | None
    supervisor_id: uuid.UUID | None
    capacity: int
    is_active: bool
    created_at: datetime
