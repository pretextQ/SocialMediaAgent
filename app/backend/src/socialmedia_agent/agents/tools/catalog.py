"""9 个内部 Tool 的实现与组装。

数据来源约束：
- get_account_profile / get_recent_contents / get_content_details /
  get_content_metrics / analyze_content_performance → Repository（核心库）
- search_operation_knowledge → RAG（运营知识）
- get_trend_data → 趋势数据（P4 提供真实源，当前返回占位空列表）
- get_historical_strategy / save_operation_memory → Memory（账号历史运营特征）

全部经 Tool 参数（pydantic schema）校验后调用，业务层不直接触碰第三方。
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select

from socialmedia_agent.memory.models import MemoryCategory, MemoryEntry
from socialmedia_agent.models.content import ContentModel
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.observation_repo import TopicObservationRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

from .base import Tool, ToolContext
from .registry import ToolRegistry


class AccountProfileArgs(BaseModel):
    account_id: str


class RecentContentsArgs(BaseModel):
    account_id: str
    limit: int = Field(default=10, ge=1, le=100)


class ContentMetricsArgs(BaseModel):
    content_id: str


class ContentDetailsArgs(BaseModel):
    content_id: str


class PerformanceArgs(BaseModel):
    account_id: str


class SearchKnowledgeArgs(BaseModel):
    query: str
    top_k: int = Field(default=3, ge=1, le=10)


class TrendArgs(BaseModel):
    platform: str | None = None
    period: int = Field(default=7, ge=1, le=90)


class StrategyArgs(BaseModel):
    account_id: str


class SaveMemoryArgs(BaseModel):
    account_id: str
    category: MemoryCategory
    content: str


def _get_account_profile(ctx: ToolContext, account_id: str) -> dict | None:
    with ctx.database.session() as session:
        accounts = AccountRepository(session).list(canonical_id=account_id, limit=1)
        if not accounts:
            return None
        a = accounts[0]
        return {
            "canonical_id": a.canonical_id,
            "platform": a.platform,
            "platform_id": a.platform_id,
            "nickname": a.nickname,
            "owner_type": a.owner_type,
        }


def _get_recent_contents(ctx: ToolContext, account_id: str, limit: int) -> list[dict]:
    with ctx.database.session() as session:
        rows = list(
            session.scalars(
                select(ContentModel)
                .where(ContentModel.account_id == account_id)
                .order_by(ContentModel.publish_time.desc())
                .limit(limit)
            )
        )
        return [
            {
                "canonical_id": r.canonical_id,
                "title": r.title,
                "content_type": r.content_type,
                "publish_time": r.publish_time.isoformat() if r.publish_time else None,
                "url": r.url,
            }
            for r in rows
        ]


def _get_content_details(ctx: ToolContext, content_id: str) -> dict | None:
    with ctx.database.session() as session:
        model = session.scalar(
            select(ContentModel).where(ContentModel.canonical_id == content_id)
        )
        if model is None:
            return None
        return {
            "canonical_id": model.canonical_id,
            "title": model.title,
            "content": model.content,
            "account_id": model.account_id,
            "content_type": model.content_type,
            "publish_time": model.publish_time.isoformat() if model.publish_time else None,
            "url": model.url,
        }


def _get_content_metrics(ctx: ToolContext, content_id: str) -> list[dict]:
    with ctx.database.session() as session:
        rows = MetricRepository(session).list(content_id=content_id, limit=100)
        return [
            {
                "metric_type": r.metric_type,
                "value": str(r.value),
                "captured_at": r.captured_at.isoformat(),
                "source": r.source,
            }
            for r in rows
        ]


def _analyze_content_performance(ctx: ToolContext, account_id: str) -> dict[str, Any]:
    with ctx.database.session() as session:
        contents = list(
            session.scalars(
                select(ContentModel).where(ContentModel.account_id == account_id)
            )
        )
        metrics = MetricRepository(session).list(account_id=account_id, limit=1000)
        total_views = sum(
            (Decimal(m.value) for m in metrics if m.metric_type == "views"),
            Decimal("0"),
        )
        return {
            "account_id": account_id,
            "content_count": len(contents),
            "metric_count": len(metrics),
            "total_views": str(total_views),
        }


def _search_operation_knowledge(ctx: ToolContext, query: str, top_k: int) -> list[dict]:
    if ctx.retriever is None:
        return []
    hits = ctx.retriever.retrieve(query, top_k=top_k)
    return [{"id": h.id, "score": h.score, "payload": h.payload} for h in hits]


# 演变判定阈值：变化幅度在 ±该百分比内视为持平，避免把噪声读成趋势
EVOLUTION_STABLE_THRESHOLD_PCT = 5.0


def topic_evolution(points: list[tuple[int, datetime]]) -> dict:
    """由「发布量 + 观测时间」序列算出话题演变方向（纯函数，可单测）。

    返回 direction / change_pct / observation_count：

    - **无观测**（快照表有数据但从未记过观测）-> direction=None；
    - **仅一次观测** -> "new"（还没有可比对象，不假装知道方向）；
    - 相邻两次比较，幅度在 ±EVOLUTION_STABLE_THRESHOLD_PCT 内 -> stable；
    - 上期为 0 且本期 > 0 -> "rising"，但 change_pct=None（增长率没有定义）。

    刻意只比较**最近两次**观测：多点回归 / 趋势拟合需要更密的采样，
    当前数据（一次导入一个点）还不支持，硬拟合会给出虚假的精确感。
    """
    if not points:
        return {"direction": None, "change_pct": None, "observation_count": 0}

    ordered = sorted(points, key=lambda item: item[1])
    count = len(ordered)
    if count == 1:
        return {"direction": "new", "change_pct": None, "observation_count": 1}

    previous_count = ordered[-2][0]
    latest_count = ordered[-1][0]
    if previous_count == 0:
        direction = "rising" if latest_count > 0 else "stable"
        return {"direction": direction, "change_pct": None, "observation_count": count}

    change_pct = (latest_count - previous_count) / previous_count * 100
    if change_pct > EVOLUTION_STABLE_THRESHOLD_PCT:
        direction = "rising"
    elif change_pct < -EVOLUTION_STABLE_THRESHOLD_PCT:
        direction = "fading"
    else:
        direction = "stable"
    return {
        "direction": direction,
        "change_pct": round(change_pct, 1),
        "observation_count": count,
    }


def _get_trend_data(ctx: ToolContext, platform: str | None, period: int) -> list[dict]:
    """趋势话题 + **演变信号**（来自只追加的观测表，见 ADR-0006）。

    快照表给「当前热度」，观测表给「上升 / 消退」；没有观测时 direction 为 None，
    而不是猜一个方向。
    """
    with ctx.database.session() as session:
        since = datetime.now(timezone.utc) - timedelta(days=period)
        rows = TopicRepository(session).list(platform=platform, since=since)
        observations = TopicObservationRepository(session)
        result: list[dict] = []
        for r in rows:
            series = observations.series(keyword=r.keyword, limit=1000)
            evolution = topic_evolution([(o.post_count, o.observed_at) for o in series])
            result.append(
                {
                    "keyword": r.keyword,
                    "title": r.title,
                    "post_count": r.post_count,
                    "first_seen": r.first_seen.isoformat() if r.first_seen else None,
                    "last_seen": r.last_seen.isoformat() if r.last_seen else None,
                    "summary": r.summary,
                    **evolution,
                }
            )
        return result


def _get_historical_strategy(ctx: ToolContext, account_id: str) -> dict:
    if ctx.memory_store is None:
        return {}
    entries = ctx.memory_store.list_for_account(account_id)
    return ctx.summarizer.summarize(entries) if ctx.summarizer else {}


def _save_operation_memory(
    ctx: ToolContext,
    account_id: str,
    category: MemoryCategory,
    content: str,
) -> dict:
    if ctx.memory_store is None:
        raise RuntimeError("memory_store 未注入，无法保存 Memory")
    entry = ctx.memory_store.add(
        MemoryEntry(
            account_id=account_id,
            category=category,
            content=content,
            created_at=datetime.now(timezone.utc),
        )
    )
    return {"memory_id": entry.id, "account_id": account_id}


def build_core_tools(ctx: ToolContext) -> list[Tool]:
    return [
        Tool(
            name="get_account_profile",
            description="获取账号资料（昵称/平台/归属）",
            args_schema=AccountProfileArgs,
            fn=lambda **kw: _get_account_profile(ctx, **kw),
        ),
        Tool(
            name="get_recent_contents",
            description="获取某账号最近内容列表（按发布时间倒序）",
            args_schema=RecentContentsArgs,
            fn=lambda **kw: _get_recent_contents(ctx, **kw),
        ),
        Tool(
            name="get_content_metrics",
            description="获取某条内容的指标快照",
            args_schema=ContentMetricsArgs,
            fn=lambda **kw: _get_content_metrics(ctx, **kw),
        ),
        Tool(
            name="get_content_details",
            description="按 content_id 获取单条内容详情（标题/正文/所属账号）",
            args_schema=ContentDetailsArgs,
            fn=lambda **kw: _get_content_details(ctx, **kw),
        ),
        Tool(
            name="analyze_content_performance",
            description="聚合分析账号内容表现（条数/指标总量）",
            args_schema=PerformanceArgs,
            fn=lambda **kw: _analyze_content_performance(ctx, **kw),
        ),
        Tool(
            name="search_operation_knowledge",
            description="检索运营知识库（RAG）",
            args_schema=SearchKnowledgeArgs,
            fn=lambda **kw: _search_operation_knowledge(ctx, **kw),
        ),
        Tool(
            name="get_trend_data",
            description="获取平台周期内趋势话题（按 last_seen 过滤）",
            args_schema=TrendArgs,
            fn=lambda **kw: _get_trend_data(ctx, **kw),
        ),
        Tool(
            name="get_historical_strategy",
            description="获取账号历史运营特征（Memory）",
            args_schema=StrategyArgs,
            fn=lambda **kw: _get_historical_strategy(ctx, **kw),
        ),
        Tool(
            name="save_operation_memory",
            description="沉淀账号历史运营特征到 Memory",
            args_schema=SaveMemoryArgs,
            fn=lambda **kw: _save_operation_memory(ctx, **kw),
        ),
    ]


def build_registry(
    database,
    retriever=None,
    memory_store=None,
    summarizer=None,
) -> ToolRegistry:
    """按依赖集合组装 ToolRegistry（Service 层统一入口）。"""
    ctx = ToolContext(
        database=database,
        retriever=retriever,
        memory_store=memory_store,
        summarizer=summarizer,
    )
    reg = ToolRegistry()
    for tool in build_core_tools(ctx):
        reg.register(tool)
    return reg
