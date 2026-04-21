"""Examiner papers

Revision ID: 003_exam_papers
Revises: 002_scribe_folders_notes
Create Date: 2026-04-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "003_exam_papers"
down_revision: Union[str, None] = "002_scribe_folders_notes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exam_papers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("source_mode", sa.String(20), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default=sa.text("'ready'")),
        sa.Column("question_count", sa.Integer(), nullable=False, server_default=sa.text("5")),
        sa.Column("settings", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("questions", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("metadata", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index("ix_exam_papers_owner_user_id", "exam_papers", ["owner_user_id"])
    op.create_index("ix_exam_papers_course_id", "exam_papers", ["course_id"])
    op.create_index("ix_exam_papers_document_id", "exam_papers", ["document_id"])
    op.create_index("ix_exam_papers_owner_created_at", "exam_papers", ["owner_user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_exam_papers_owner_created_at", table_name="exam_papers")
    op.drop_index("ix_exam_papers_document_id", table_name="exam_papers")
    op.drop_index("ix_exam_papers_course_id", table_name="exam_papers")
    op.drop_index("ix_exam_papers_owner_user_id", table_name="exam_papers")
    op.drop_table("exam_papers")
