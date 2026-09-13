"""系统状态聚合接口（只读）。

GET /api/v1/system/status

给前端「系统状态」页（docs/plan-frontend.md P8）提供一次性的只读快照：
LLM 配置、库 / 知识库 / 周报路径，以及核心库、Memory、RAG、周报的计数。

约束（AGENTS.md）：
- 计数一律经 Repository / Memory store / VectorStore 的公开方法，**不在此手写 SQL**；
- 只读，不写任何数据。
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from socialmedia_agent.config import Settings, get_settings
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

from ..deps import get_memory_store, get_session

router = APIRouter(prefix="/system", tags=["system"])


class SystemStatusResponse(BaseModel):
    llm_configured: bool
    llm_model: str
    llm_base_url: str
    database_url: str
    memory_database_url: str
    knowledge_store_path: str
    knowledge_doc_count: int
    memory_entry_count: int
    account_count: int
    content_count: int
    metric_count: int
    topic_count: int
    report_dir: str
    report_count: int


def _count_report_files(report_dir: str) -> int:
    """report_dir 下的 *.md 数量；目录不存在按 0 处理（不报错）。"""
    path = Path(report_dir)
    if not path.is_dir():
        return 0
    return sum(1 for p in path.iterdir() if p.is_file() and p.suffix == ".md")


@router.get(
    "/status",
    response_model=SystemStatusResponse,
    summary="系统状态聚合（只读）",
    description=(
        "返回 LLM 配置、数据库 / 知识库 / 周报路径，以及核心库、Memory、RAG 与周报的计数。"
        "只读端点，不产生任何写入。"
    ),
)
def get_system_status(
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> SystemStatusResponse:
    database = request.app.state.database
    retriever = getattr(request.app.state, "retriever", None)
    memory_store = get_memory_store(request)

    return SystemStatusResponse(
        llm_configured=settings.llm_api_key is not None,
        llm_model=settings.llm_model,
        llm_base_url=settings.llm_base_url,
        database_url=database.url,
        memory_database_url=settings.memory_database_url,
        knowledge_store_path=settings.knowledge_store_path,
        knowledge_doc_count=retriever.store.count() if retriever is not None else 0,
        memory_entry_count=memory_store.count(),
        account_count=AccountRepository(session).count(),
        content_count=ContentRepository(session).count(),
        metric_count=MetricRepository(session).count(),
        topic_count=TopicRepository(session).count(),
        report_dir=settings.report_dir,
        report_count=_count_report_files(settings.report_dir),
    )
