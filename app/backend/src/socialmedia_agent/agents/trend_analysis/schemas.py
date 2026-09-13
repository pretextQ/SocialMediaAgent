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
    # 演变信号来自**只追加的观测表**（见 docs/adr/0006-time-series.md）。
    # 无观测时 direction=None、observation_count=0 —— 表示「还不知道方向」，
    # 而不是「持平」：这两件事必须能区分。
    direction: str | None = Field(
        default=None, description="rising | fading | stable | new；无观测时为 None"
    )
    change_pct: float | None = Field(
        default=None, description="最近两次观测的变化百分比；上期为 0 时无定义"
    )
    observation_count: int = Field(default=0, description="该话题累计观测点数")


class TrendAnalysisOutput(BaseModel):
    platform: str
    period: int = Field(ge=1, le=90)
    topics: list[TrendTopic] = Field(default_factory=list)
    trend_score: int = Field(ge=0, le=100, description="趋势热度评分 0-100")
    insights: list[str] = Field(default_factory=list)
