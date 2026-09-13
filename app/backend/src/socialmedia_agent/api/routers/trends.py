"""趋势分析接口（P4-2）。

POST /api/v1/trends/analysis
→ 运行 Trend Analysis Agent（gather → analyze → report）
→ 返回 { analysis, report }
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from socialmedia_agent.agents.common import AnalyzeSource
from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.agents.trend_analysis.graph import build_trend_analysis_graph
from socialmedia_agent.agents.trend_analysis.schemas import TrendAnalysisOutput
from socialmedia_agent.database.session import Database

from ..deps import get_gateway

router = APIRouter(prefix="/trends", tags=["trend_analysis"])


class TrendRequest(BaseModel):
    platform: str
    period: int = Field(default=7, ge=1, le=90)


class TrendAnalysisResponse(BaseModel):
    analysis: TrendAnalysisOutput
    report: str
    source: AnalyzeSource = Field(
        description="本次结果的实际来源：llm = LLM 结构化输出；rules = 规则兜底"
    )


@router.post(
    "/analysis",
    response_model=TrendAnalysisResponse,
    summary="平台趋势分析",
    description="运行 Trend Analysis Agent，返回周期内趋势话题（DB 事实）/趋势评分/洞察 + 人类可读报告。gateway 未配置时走规则兜底。",
)
def analyze_trends(req: TrendRequest, request: Request) -> TrendAnalysisResponse:
    database: Database = request.app.state.database

    registry = build_registry(
        database, retriever=getattr(request.app.state, "retriever", None)
    )

    graph = build_trend_analysis_graph(
        registry, gateway=get_gateway(request, "trend_analysis")
    )
    state = graph.invoke({"platform": req.platform, "period": req.period})
    return TrendAnalysisResponse(
        analysis=state["analysis"],
        report=state["report"],
        source=state.get("analyze_source", "rules"),
    )
