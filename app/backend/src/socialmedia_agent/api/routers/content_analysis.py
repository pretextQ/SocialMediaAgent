"""内容分析接口（P4-1）。

POST /api/v1/contents/{content_id}/analysis
→ 运行 Content Analysis Agent（gather → analyze → report）
→ 返回 { analysis, report }
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from socialmedia_agent.agents.content_analysis.graph import build_content_analysis_graph
from socialmedia_agent.agents.content_analysis.schemas import ContentAnalysisOutput
from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.database.session import Database
from socialmedia_agent.repositories.content_repo import ContentRepository

router = APIRouter(prefix="/contents", tags=["content_analysis"])


class ContentAnalysisResponse(BaseModel):
    analysis: ContentAnalysisOutput
    report: str


@router.post(
    "/{content_id}/analysis",
    response_model=ContentAnalysisResponse,
    summary="单条内容质量分析",
    description="运行 Content Analysis Agent，返回质量评分/优势/不足/建议 + 人类可读报告。gateway 未配置时走规则兜底。",
)
def analyze_content(content_id: str, request: Request) -> ContentAnalysisResponse:
    database: Database = request.app.state.database

    with database.session() as session:
        content = ContentRepository(session).list(canonical_id=content_id, limit=1)
    if not content:
        raise HTTPException(status_code=404, detail="content not found")

    ctx = ToolContext(database=database)
    registry = ToolRegistry()
    for tool in build_core_tools(ctx):
        registry.register(tool)

    graph = build_content_analysis_graph(
        registry, gateway=getattr(request.app.state, "gateway", None)
    )
    state = graph.invoke({"content_id": content_id})
    return ContentAnalysisResponse(analysis=state["analysis"], report=state["report"])
