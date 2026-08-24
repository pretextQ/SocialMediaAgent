"""运营策略接口（P4-5）。

POST /api/v1/accounts/{account_id}/strategy
→ 运行 Strategy Advisor Agent（gather → analyze → persist → report）
→ 返回 { strategy, report, memory_saved }
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from socialmedia_agent.agents.strategy_advisor.graph import build_strategy_advisor_graph
from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.database.session import Database
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore, build_memory_store
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.repositories.account_repo import AccountRepository

router = APIRouter(prefix="/accounts", tags=["strategy_advisor"])


def _memory_store(request: Request) -> SQLAlchemyMemoryStore:
    store = getattr(request.app.state, "memory_store", None)
    if store is None:
        store = build_memory_store()  # 默认 Memory 独立库（env 可覆盖）
        request.app.state.memory_store = store
    return store


@router.post("/{account_id}/strategy")
def advise_strategy(account_id: str, request: Request) -> dict:
    database: Database = request.app.state.database

    with database.session() as session:
        account = AccountRepository(session).list(canonical_id=account_id, limit=1)
    if not account:
        raise HTTPException(status_code=404, detail="account not found")

    ctx = ToolContext(
        database=database,
        memory_store=_memory_store(request),
        summarizer=Summarizer(),
    )
    registry = ToolRegistry()
    for tool in build_core_tools(ctx):
        registry.register(tool)

    graph = build_strategy_advisor_graph(registry, gateway=None)  # 规则兜底；LLM 增强后注入 gateway
    state = graph.invoke({"account_id": account_id})
    return {
        "strategy": state["strategy"].model_dump(),
        "report": state["report"],
        "memory_saved": state.get("memory_saved"),
    }
