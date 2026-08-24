"""FastAPI 应用工厂。

create_app(database, memory_store, gateway) 支持注入测试依赖；
gateway 默认 None（规则兜底），生产入口显式构建（见文件尾部）。
模块级 app 使用默认数据库 + 配置构建的 gateway。
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from socialmedia_agent.database.session import Database
from socialmedia_agent.llm.factory import build_gateway
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore

from .routers import (
    accounts,
    content_analysis,
    contents,
    diagnosis,
    metrics,
    strategy_advisor,
    title_optimization,
    topic_recommendation,
    trends,
)


def create_app(
    database: Database | None = None,
    memory_store: SQLAlchemyMemoryStore | None = None,
    gateway: LLMGateway | None = None,
) -> FastAPI:
    db = database or Database()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        db.create_all()
        yield

    app = FastAPI(title="SocialMediaAgent", version="0.1.0", lifespan=lifespan)

    app.state.database = db
    app.state.memory_store = memory_store
    app.state.gateway = gateway

    app.include_router(accounts.router, prefix="/api/v1")
    app.include_router(contents.router, prefix="/api/v1")
    app.include_router(content_analysis.router, prefix="/api/v1")
    app.include_router(metrics.router, prefix="/api/v1")
    app.include_router(trends.router, prefix="/api/v1")
    app.include_router(diagnosis.router, prefix="/api/v1")
    app.include_router(topic_recommendation.router, prefix="/api/v1")
    app.include_router(title_optimization.router, prefix="/api/v1")
    app.include_router(strategy_advisor.router, prefix="/api/v1")
    return app


app = create_app(gateway=build_gateway())
