"""Title Optimization 输出契约（P4-4，固定 schema）。

输入 content_id 或原始标题 → 输出原标题 + 固定 3 条优化标题 + 说明。
optimized_titles 固定为 3 条（min_length/max_length=3，回归测试约束）。
schema 有回归测试（tests/agent/test_title_optimization.py）。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class TitleOptimizationOutput(BaseModel):
    original: str
    optimized_titles: list[str] = Field(
        min_length=3, max_length=3, description="固定 3 条优化标题"
    )
    explanation: str = ""
