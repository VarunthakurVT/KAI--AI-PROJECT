"""Scribe folders + notes

Revision ID: 002_scribe_folders_notes
Revises: 001_initial
Create Date: 2026-04-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "002_scribe_folders_notes"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scribe_folders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_scribe_folders_user_id", "scribe_folders", ["user_id"])
    op.create_index("ix_scribe_folders_user_name", "scribe_folders", ["user_id", "name"], unique=True)

    op.create_table(
        "scribe_notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("folder_id", UUID(as_uuid=True), sa.ForeignKey("scribe_folders.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("structured_notes", JSONB(), nullable=True),
        sa.Column("audio_filename", sa.String(512), nullable=True),
        sa.Column("audio_mime", sa.String(120), nullable=True),
        sa.Column("audio_bytes", sa.LargeBinary(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_scribe_notes_user_id", "scribe_notes", ["user_id"])
    op.create_index("ix_scribe_notes_folder_id", "scribe_notes", ["folder_id"])
    op.create_index("ix_scribe_notes_user_created_at", "scribe_notes", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_scribe_notes_user_created_at", table_name="scribe_notes")
    op.drop_index("ix_scribe_notes_folder_id", table_name="scribe_notes")
    op.drop_index("ix_scribe_notes_user_id", table_name="scribe_notes")
    op.drop_table("scribe_notes")
    op.drop_index("ix_scribe_folders_user_name", table_name="scribe_folders")
    op.drop_index("ix_scribe_folders_user_id", table_name="scribe_folders")
    op.drop_table("scribe_folders")

