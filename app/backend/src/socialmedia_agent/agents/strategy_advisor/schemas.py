"""Strategy Advisor 输出契约（P4-5，固定 schema）。

输入 account_id → 输出运营策略：摘要 / 周计划 / KPI / 风险。
结束时会写入 Memory（category=strategy）形成读-写闭环。
schema 有回归测试（tests/agent/test_strategy_advisor.py）。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class StrategyAdvisorOutput(BaseModel):
    account_id: str
    strategy_summary: str
    weekly_plan: list[str] = Field(default_factory=list)
    kpis: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
