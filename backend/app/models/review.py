"""
CodeSentinel — Review ORM model.
Stores the full pipeline output for one submission.
findings, risk_scores, explanations are stored as JSON text blobs —
all business logic uses Pydantic objects, DB is just persistence.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID4
    submission_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("submissions.id"), nullable=False, index=True
    )

    # "pending" | "done" | "failed"
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")

    # JSON-serialized List[Finding]
    findings_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON-serialized List[RiskScore]
    risk_scores_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON-serialized List[Explanation]
    explanations_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Error message when status == "failed"
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
