"""Trend Analysis 输出契约（P4-2，固定 schema）。

输入 platform + period（天数）→ 输出周期内平台趋势话题、趋势评分与洞察。
topics 字段必须以数据库（Topic 表）事实为准，LLM 不得编造话题。
schema 有回归测试（tests/agent/test_trend_analysis.py）。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class TrendTopic(BaseModel):
    keyword: str
    title: str | None = None
    post_count: int = 0


class TrendAnalysisOutput(BaseModel):
    platform: str
    period: int = Field(ge=1, le=90)
    topics: list[TrendTopic] = Field(default_factory=list)
    trend_score: int = Field(ge=0, le=100, description="趋势热度评分 0-100")
    insights: list[str] = Field(default_factory=list)
