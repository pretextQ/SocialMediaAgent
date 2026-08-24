"""标题优化接口（P4-4）。

POST /api/v1/titles/optimize
body: { content_id?, title? }（至少提供其一）
→ 运行 Title Optimization Agent（gather → analyze → report）
→ 返回 { optimization, report }
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, model_validator

from socialmedia_agent.agents.title_optimization.graph import build_title_optimization_graph
from socialmedia_agent.agents.title_optimization.schemas import TitleOptimizationOutput
from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.database.session import Database
from socialmedia_agent.repositories.content_repo import ContentRepository

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


@router.post(
    "/optimize",
    response_model=TitleOptimizationResponse,
    summary="标题优化",
    description="运行 Title Optimization Agent（content_id 或原始标题两种模式），返回固定 3 条优化标题 + 说明 + 人类可读报告。gateway 未配置时走规则兜底。",
)
def optimize_title(req: TitleOptimizeRequest, request: Request) -> TitleOptimizationResponse:
    database: Database = request.app.state.database

    if req.content_id:
        with database.session() as session:
            content = ContentRepository(session).list(canonical_id=req.content_id, limit=1)
        if not content:
            raise HTTPException(status_code=404, detail="content not found")

    ctx = ToolContext(database=database)
    registry = ToolRegistry()
    for tool in build_core_tools(ctx):
        registry.register(tool)

    graph = build_title_optimization_graph(registry, gateway=None)  # 规则兜底；LLM 增强后注入 gateway
    state = graph.invoke({"content_id": req.content_id, "title": req.title})
    return TitleOptimizationResponse(optimization=state["optimization"], report=state["report"])
