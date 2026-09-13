"""标题优化接口（P5.5.1：内部能力直调，不再经 LangGraph 图）。

POST /api/v1/titles/optimize
body: { content_id?, title? }（至少提供其一）
→ gather → analyze → render（契约不变，固定 3 条）
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from socialmedia_agent.agents.common import AnalyzeSource
from socialmedia_agent.agents.title_optimization import nodes as title_capability
from socialmedia_agent.agents.title_optimization.schemas import TitleOptimizationOutput
from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.database.session import Database
from socialmedia_agent.repositories.content_repo import ContentRepository

from ..deps import get_gateway

router = APIRouter(prefix="/titles", tags=["title_optimization"])


class TitleOptimizeRequest(BaseModel):
    content_id: str | None = None
    title: str | None = None

    @model_validator(mode="after")
    def _require_at_least_one(self) -> "TitleOptimizeRequest":
        if not self.content_id and not self.title:
            raise ValueError("content_id 与 title 至少提供一个")
        return self


class TitleOptimizationResponse(BaseModel):
    optimization: TitleOptimizationOutput
    report: str
    source: AnalyzeSource = Field(
        description="本次结果的实际来源：llm = LLM 结构化输出；rules = 规则兜底"
    )


@router.post(
    "/optimize",
    response_model=TitleOptimizationResponse,
    summary="标题优化",
    description="运行 Title Optimization 内部能力（content_id 或原始标题两种模式），返回固定 3 条优化标题 + 说明 + 人类可读报告。gateway 未配置时走规则兜底。",
)
def optimize_title(req: TitleOptimizeRequest, request: Request) -> TitleOptimizationResponse:
    database: Database = request.app.state.database

    if req.content_id:
        with database.session() as session:
            content = ContentRepository(session).list(canonical_id=req.content_id, limit=1)
        if not content:
            raise HTTPException(status_code=404, detail="content not found")

    registry = build_registry(
        database, retriever=getattr(request.app.state, "retriever", None)
    )
    facts = title_capability.gather(registry, content_id=req.content_id, title=req.title)
    optimization, source = title_capability.analyze_with_source(
        get_gateway(request, "title_optimization"), facts
    )
    return TitleOptimizationResponse(
        optimization=optimization,
        report=title_capability.render_report(optimization, facts),
        source=source,
    )
