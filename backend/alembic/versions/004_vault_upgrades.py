"""Vault upgrades: daily_progress, page filtering, soft deletes

Revision ID: 004_vault_upgrades
Revises: 003_exam_papers
Create Date: 2026-04-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision: str = "004_vault_upgrades"
down_revision: Union[str, None] = "003_exam_papers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. User: add daily_goal_minutes ──
    op.add_column(
        "users",
        sa.Column("daily_goal_minutes", sa.Integer(), nullable=False, server_default=sa.text("180")),
    )

    # ── 2. Document: add soft delete ──
    op.add_column(
        "documents",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # ── 3. Chunk: add page_start, page_end, heading for filtered RAG ──
    op.add_column("chunks", sa.Column("page_start", sa.Integer(), nullable=True))
    op.add_column("chunks", sa.Column("page_end", sa.Integer(), nullable=True))
    op.add_column("chunks", sa.Column("heading", sa.String(500), nullable=True))

    # ── 4. Conversation: add soft delete ──
    op.add_column(
        "conversations",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # ── 5. ScribeNote: add soft delete ──
    op.add_column(
        "scribe_notes",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # ── 6. Create daily_progress table ──
    op.create_table(
        "daily_progress",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("minutes_studied", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("topics_studied", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("streak_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index("ix_daily_progress_user_id", "daily_progress", ["user_id"])
    op.create_index("ix_daily_progress_user_date", "daily_progress", ["user_id", "date"])
    op.create_unique_constraint("uq_daily_progress_user_date", "daily_progress", ["user_id", "date"])


def downgrade() -> None:
    # Drop daily_progress
    op.drop_constraint("uq_daily_progress_user_date", "daily_progress", type_="unique")
    op.drop_index("ix_daily_progress_user_date", table_name="daily_progress")
    op.drop_index("ix_daily_progress_user_id", table_name="daily_progress")
    op.drop_table("daily_progress")

    # Remove soft-delete columns
    op.drop_column("scribe_notes", "is_deleted")
    op.drop_column("conversations", "is_deleted")
    op.drop_column("documents", "is_deleted")

    # Remove chunk filtering columns
    op.drop_column("chunks", "heading")
    op.drop_column("chunks", "page_end")
    op.drop_column("chunks", "page_start")

    # Remove daily_goal_minutes from users
    op.drop_column("users", "daily_goal_minutes")
