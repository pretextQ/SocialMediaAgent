"""账号诊断接口（P5.5.1 兼容 shim）。

POST /api/v1/accounts/{account_id}/diagnosis
→ 运行 Account Strategy Agent（合并），提取诊断子集
→ 返回 { diagnosis, report }（契约不变）
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from socialmedia_agent.agents.account_strategy.graph import build_account_strategy_graph
from socialmedia_agent.agents.account_strategy.schemas import DiagnosisOutput
from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.database.session import Database
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.repositories.account_repo import AccountRepository

from ..deps import get_memory_store

router = APIRouter(prefix="/accounts", tags=["diagnosis"])


class DiagnosisResponse(BaseModel):
    diagnosis: DiagnosisOutput
    report: str


@router.post(
    "/{account_id}/diagnosis",
    response_model=DiagnosisResponse,
    summary="账号健康诊断",
    description="运行 Account Strategy Agent（合并诊断+策略），返回诊断子集 + 人类可读报告。gateway 未配置时走规则兜底。",
)
def diagnose_account(account_id: str, request: Request) -> DiagnosisResponse:
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
    return DiagnosisResponse(
        diagnosis=state["strategy"].to_diagnosis(),
        report=state["report"],
    )
