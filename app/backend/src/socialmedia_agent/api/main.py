"""FastAPI 应用工厂。

create_app(database, memory_store, gateway, gateway_factory, retriever) 支持注入测试依赖；
gateway / retriever 默认 None（规则兜底 / 空知识库），生产入口显式构建（见文件尾部）。

- `gateway`：默认 gateway（role=None），供 /system/status 读取熔断状态，并作为角色解析的兜底；
- `gateway_factory`：`(role) -> LLMGateway | None`，生产入口按角色构建（各自模型与熔断）。
  未注入时所有角色共用 `gateway`，既有测试无需改动。
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI

from socialmedia_agent.config import get_settings
from socialmedia_agent.database.migrations import upgrade_to_head
from socialmedia_agent.database.session import Database
from socialmedia_agent.llm.factory import build_gateway, build_role_gateway
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.rag.knowledge import build_knowledge_retriever
from socialmedia_agent.rag.retriever import Retriever
from socialmedia_agent.services.scheduler import create_weekly_report_scheduler

from .routers import (
    accounts,
    content_analysis,
    contents,
    diagnosis,
    metrics,
    reports,
    strategy_advisor,
    system_status,
    title_optimization,
    topic_recommendation,
    trends,
)


def create_app(
    database: Database | None = None,
    memory_store: SQLAlchemyMemoryStore | None = None,
    gateway: LLMGateway | None = None,
    retriever: Retriever | None = None,
    gateway_factory: Callable[[str], LLMGateway | None] | None = None,
) -> FastAPI:
    db = database or Database()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        # 生产入口用 Alembic 迁移建表/升级（测试与临时库仍可用 Database.create_all）
        upgrade_to_head(db.url)

        # 周报调度：**默认关闭**（SMA_SCHEDULER_ENABLED）。开启时才起后台线程，
        # 避免本地工具「启动就悄悄跑调度」以及测试被 lifespan 的线程拖脆。
        scheduler = None
        if get_settings().scheduler_enabled:
            scheduler = create_weekly_report_scheduler(
                db, memory_store, gateway=gateway
            )
            scheduler.start()
            app.state.scheduler = scheduler

        yield

        # 关闭时先停调度器（否则线程会在 Memory store 被 dispose 后仍持有它）
        if scheduler is not None:
            scheduler.shutdown(wait=False)
            app.state.scheduler = None

        # 释放 Memory store 的 session 与引擎（此前从不释放）
        store = getattr(app.state, "memory_store", None)
        if store is not None:
            store.dispose()

    app = FastAPI(title="SocialMediaAgent", version="0.1.0", lifespan=lifespan)

    app.state.database = db
    app.state.memory_store = memory_store
    app.state.gateway = gateway
    app.state.retriever = retriever
    app.state.gateway_factory = gateway_factory

    app.include_router(accounts.router, prefix="/api/v1")
    app.include_router(contents.router, prefix="/api/v1")
    app.include_router(content_analysis.router, prefix="/api/v1")
    app.include_router(metrics.router, prefix="/api/v1")
    app.include_router(trends.router, prefix="/api/v1")
    app.include_router(diagnosis.router, prefix="/api/v1")
    app.include_router(topic_recommendation.router, prefix="/api/v1")
    app.include_router(title_optimization.router, prefix="/api/v1")
    app.include_router(strategy_advisor.router, prefix="/api/v1")
    app.include_router(reports.router, prefix="/api/v1")
    app.include_router(system_status.router, prefix="/api/v1")
    return app


app = create_app(
    gateway=build_gateway(),
    retriever=build_knowledge_retriever(),
    gateway_factory=build_role_gateway,
)
