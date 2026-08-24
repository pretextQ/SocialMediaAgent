"""运营策略接口（P5.5.1：Account Strategy Agent 全量输出）。

POST /api/v1/accounts/{account_id}/strategy
→ 运行 Account Strategy Agent（gather → analyze → persist → report）
→ 返回 { strategy(合并诊断+策略), report, memory_saved }
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from socialmedia_agent.agents.account_strategy.graph import build_account_strategy_graph
from socialmedia_agent.agents.account_strategy.schemas import AccountStrategyOutput
from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.database.session import Database
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.repositories.account_repo import AccountRepository

from ..deps import get_memory_store

router = APIRouter(prefix="/accounts", tags=["strategy_advisor"])


class StrategyAdvisorResponse(BaseModel):
    strategy: AccountStrategyOutput
    report: str
    memory_saved: dict | None = None


@router.post(
    "/{account_id}/strategy",
    response_model=StrategyAdvisorResponse,
    summary="账号运营诊断与策略制定",
    description="运行 Account Strategy Agent，返回健康度 + 策略摘要/周计划/KPI/风险 + 人类可读报告，并将策略沉淀到 Memory（读-写闭环）。gateway 未配置时走规则兜底。",
)
def advise_strategy(account_id: str, request: Request) -> StrategyAdvisorResponse:
    database: Database = request.app.state.database

    with database.session() as session:
        account = AccountRepository(session).list(canonical_id=account_id, limit=1)
    if not account:
        raise HTTPException(status_code=404, detail="account not found")

    registry = build_registry(
        database,
        memory_store=get_memory_store(request),
        summarizer=Summarizer(),
    )
    graph = build_account_strategy_graph(registry, gateway=None)  # 规则兜底；LLM 注入见 P5.5.3
    state = graph.invoke({"account_id": account_id})
    return StrategyAdvisorResponse(
        strategy=state["strategy"],
        report=state["report"],
        memory_saved=state.get("memory_saved"),
    )
