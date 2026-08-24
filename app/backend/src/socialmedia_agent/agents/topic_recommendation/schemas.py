"""Topic Recommendation 输出契约（P4-3，固定 schema）。

输入 account_id → 输出推荐选题数组（标题/理由/预估兴趣度）。
候选必须来自 DB 事实（趋势话题）或知识库，且不与已有内容标题重复。
schema 有回归测试（tests/agent/test_topic_recommendation.py）。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class RecommendedTopic(BaseModel):
    title: str
    rationale: str = ""
    estimated_interest: int = Field(ge=0, le=100, description="预估兴趣度 0-100")


class TopicRecommendationOutput(BaseModel):
    account_id: str
    topics: list[RecommendedTopic] = Field(default_factory=list)
