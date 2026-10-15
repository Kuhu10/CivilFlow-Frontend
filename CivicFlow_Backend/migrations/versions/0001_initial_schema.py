"""Initial CivicFlow schema baseline.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-10-14
"""
from alembic import op

from app.db.base import Base
from app import models  # noqa: F401 - register mapped tables

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Baseline revision for a new project. Future changes should use normal Alembic op directives.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
