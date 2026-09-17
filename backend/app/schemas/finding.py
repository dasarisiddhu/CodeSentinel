"""
CodeSentinel — Finding schema.
Exact field names from PRD Section 3.1.
Produced by the Detection Agent (Semgrep + Bandit + Radon).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Finding(BaseModel):
    id: str = Field(..., description="Unique finding ID (uuid4 str)")
    file: str = Field(..., description="Source filename")
    line_start: int = Field(..., ge=0)
    line_end: int = Field(..., ge=0)
    rule_id: str = Field(..., description="Semgrep/Bandit rule identifier")
    category: Literal["bug", "security", "code_smell"]
    tool_severity: Literal["high", "medium", "low"]
    message: str = Field(..., description="Tool's own description of the finding")
    code_snippet: str = Field(..., description="Relevant lines of source code")
