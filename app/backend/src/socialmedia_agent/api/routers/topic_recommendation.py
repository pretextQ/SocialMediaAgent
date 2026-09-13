"""选题推荐接口（P5.5.1：内部能力直调，不再经 LangGraph 图）。

POST /api/v1/accounts/{account_id}/topic-recommendation
→ gather → analyze → render（契约不变）
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from socialmedia_agent.agents.common import AnalyzeSource
from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.agents.topic_recommendation import nodes as topic_capability
from socialmedia_agent.agents.topic_recommendation.schemas import TopicRecommendationOutput
from socialmedia_agent.database.session import Database
from socialmedia_agent.repositories.account_repo import AccountRepository

from ..deps import get_gateway

router = APIRouter(prefix="/accounts", tags=["topic_recommendation"])


class TopicRecommendationResponse(BaseModel):
    recommendation: TopicRecommendationOutput
    report: str
    source: AnalyzeSource = Field(
        description="本次结果的实际来源：llm = LLM 结构化输出；rules = 规则兜底"
    )


@router.post(
    "/{account_id}/topic-recommendation",
    response_model=TopicRecommendationResponse,
    summary="选题推荐",
    description="运行 Topic Recommendation 内部能力，返回推荐选题（趋势候选/知识库，去重已有内容）+ 人类可读报告。gateway 未配置时走规则兜底。",
)
def recommend_topics(account_id: str, request: Request) -> TopicRecommendationResponse:
    database: Database = request.app.state.database

    with database.session() as session:
        account = AccountRepository(session).list(canonical_id=account_id, limit=1)
    if not account:
        raise HTTPException(status_code=404, detail="account not found")

    registry = build_registry(
        database, retriever=getattr(request.app.state, "retriever", None)
    )
    facts = topic_capability.gather(registry, account_id)
    recommendation, source = topic_capability.analyze_with_source(
        get_gateway(request, "topic_recommendation"), facts
    )
    return TopicRecommendationResponse(
        recommendation=recommendation,
        report=topic_capability.render_report(recommendation, facts),
        source=source,
    )
