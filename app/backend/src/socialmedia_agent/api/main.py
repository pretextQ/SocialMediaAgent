"""FastAPI 应用工厂。

create_app(database) 支持注入测试数据库；模块级 app 使用默认数据库。
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from socialmedia_agent.database.session import Database

from .routers import accounts, contents, metrics


def create_app(database: Database | None = None) -> FastAPI:
    db = database or Database()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        db.create_all()
        yield

    app = FastAPI(title="SocialMediaAgent", version="0.1.0", lifespan=lifespan)

    app.state.database = db

    app.include_router(accounts.router, prefix="/api/v1")
    app.include_router(contents.router, prefix="/api/v1")
    app.include_router(metrics.router, prefix="/api/v1")
    return app


app = create_app()
