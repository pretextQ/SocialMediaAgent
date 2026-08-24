"""Account Diagnosis 输出契约（P3，固定 schema）。

P3 DoD：输出严格满足以下结构；schema 有回归测试。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class DiagnosisOutput(BaseModel):
    account_health: int = Field(ge=0, le=100, description="账号健康度 0-100")
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    anomalies: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
