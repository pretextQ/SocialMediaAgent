"""Content Analysis 输出契约（P4-1，固定 schema）。

输入 content_id → 输出单条内容的质量分析：标题/摘要/质量评分/优势/不足/建议。
schema 有回归测试（tests/agent/test_content_analysis.py）。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ContentAnalysisOutput(BaseModel):
    content_id: str
    title: str | None = None
    summary: str = ""
    quality_score: int = Field(ge=0, le=100, description="内容质量评分 0-100")
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
