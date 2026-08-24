"""Account Strategy 输出契约（P5.5.1，合并 Diagnosis + Strategy）。

输入 account_id → 输出账号健康诊断 + 运营策略（扁平合并）。
诊断子集可由 to_diagnosis() 提取，供 /diagnosis 兼容端点使用。
schema 有回归测试（tests/agent/test_account_strategy.py）。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class DiagnosisOutput(BaseModel):
    """诊断子集契约（兼容 /diagnosis 端点，P3 契约保持不变）。"""

    account_health: int = Field(ge=0, le=100, description="账号健康度 0-100")
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    anomalies: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class AccountStrategyOutput(BaseModel):
    account_id: str
    account_health: int = Field(ge=0, le=100, description="账号健康度 0-100")
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    anomalies: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    strategy_summary: str
    weekly_plan: list[str] = Field(default_factory=list)
    kpis: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)

    def to_diagnosis(self) -> DiagnosisOutput:
        """提取诊断子集（/diagnosis 兼容端点使用）。"""
        return DiagnosisOutput(
            account_health=self.account_health,
            strengths=self.strengths,
            weaknesses=self.weaknesses,
            anomalies=self.anomalies,
            recommendations=self.recommendations,
        )
