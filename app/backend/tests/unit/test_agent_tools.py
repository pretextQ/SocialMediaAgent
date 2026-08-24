"""Agent 内部 Tool 单元测试（TDD）。

覆盖：
- Tool 基础契约：invoke 校验参数并调用
- Registry：register/get/list/invoke
- 8 个工具各自可独立调用：
  get_account_profile / get_recent_contents / get_content_metrics /
  analyze_content_performance / search_operation_knowledge /
  get_trend_data / get_historical_strategy / save_operation_memory
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from pydantic import BaseModel

from socialmedia_agent.agents.tools.base import Tool, ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.memory.models import MemoryCategory, MemoryEntry
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.rag import HashEmbedder, InMemoryVectorStore, Retriever
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository


NOW = datetime(2026, 8, 24, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def context(tmp_path, monkeypatch):
    db = Database(url=f"sqlite:///{tmp_path / 'tools.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        c1 = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id="bilibili:90001",
                title="人工智能入门",
                content_type=ContentType.VIDEO,
                publish_time=NOW,
            )
        )
        c2 = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1002",
                account_id="bilibili:90001",
                title="AI 绘画教程",
                content_type=ContentType.VIDEO,
                publish_time=NOW - timedelta(days=1),
            )
        )
        MetricRepository(session).upsert(
            Metric(
                content_id=c1.canonical_id,
                account_id="bilibili:90001",
                platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS,
                value="1000",
                captured_at=NOW,
                source=MetricSource.MEDIACRAWLER,
            )
        )
        MetricRepository(session).upsert(
            Metric(
                content_id=c2.canonical_id,
                account_id="bilibili:90001",
                platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS,
                value="500",
                captured_at=NOW,
                source=MetricSource.MEDIACRAWLER,
            )
        )

    store = InMemoryVectorStore()
    emb = HashEmbedder(dim=64)
    store.add(
        emb.embed_texts(["B站标题写作方法：开头3秒钩子 + 数字 + 情绪词"]),
        [{"title": "标题写作", "content": "B站标题写作方法"}],
        ids=["k1"],
    )

    m_engine = create_memory_engine(tmp_path)
    ctx = ToolContext(
        database=db,
        retriever=Retriever(embedder=emb, store=store),
        memory_store=SQLAlchemyMemoryStore(m_engine["session"]),
        summarizer=Summarizer(),
    )
    yield ctx
    db.engine.dispose()


def create_memory_engine(tmp_path):
    from sqlalchemy.orm import sessionmaker

    from socialmedia_agent.database.engine import create_db_engine

    engine = create_db_engine(f"sqlite:///{tmp_path / 'mem.db'}")
    SQLAlchemyMemoryStore.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    session = factory()
    return {"engine": engine, "session": session}


@pytest.fixture
def tools(context):
    return build_core_tools(context)


def test_tool_invokes_with_validated_args():
    class Args(BaseModel):
        x: int

    calls = []

    def fn(x: int) -> str:
        calls.append(x)
        return f"got {x}"

    tool = Tool(name="t", description="d", args_schema=Args, fn=fn)
    assert tool.invoke(x=3) == "got 3"
    assert calls == [3]


def test_tool_invalid_args_raise():
    class Args(BaseModel):
        x: int

    tool = Tool(name="t", description="d", args_schema=Args, fn=lambda x: x)
    with pytest.raises(Exception):
        tool.invoke(x="not-an-int")


def test_registry_get_list_invoke(tools):
    reg = ToolRegistry()
    for t in tools:
        reg.register(t)
    assert len(reg.list()) == 8
    result = reg.invoke("get_account_profile", account_id="bilibili:90001")
    assert result["canonical_id"] == "bilibili:90001"
    with pytest.raises(KeyError):
        reg.get("nonexistent")


def test_get_account_profile(context):
    tools = build_core_tools(context)
    reg = ToolRegistry()
    for t in tools:
        reg.register(t)
    result = reg.invoke("get_account_profile", account_id="bilibili:90001")
    assert result["nickname"] == "UP主A"


def test_get_recent_contents_ordered(context):
    tools = {t.name: t for t in build_core_tools(context)}
    result = tools["get_recent_contents"].invoke(account_id="bilibili:90001", limit=10)
    assert len(result) == 2
    assert result[0]["title"] == "人工智能入门"  # 最新的在前


def test_get_content_metrics(context):
    tools = {t.name: t for t in build_core_tools(context)}
    result = tools["get_content_metrics"].invoke(content_id="bilibili:1001")
    assert len(result) == 1
    assert result[0]["metric_type"] == "views"
    assert Decimal(result[0]["value"]) == Decimal("1000")


def test_analyze_content_performance(context):
    tools = {t.name: t for t in build_core_tools(context)}
    result = tools["analyze_content_performance"].invoke(account_id="bilibili:90001")
    assert result["content_count"] == 2
    assert Decimal(result["total_views"]) == Decimal("1500")


def test_search_operation_knowledge(context):
    tools = {t.name: t for t in build_core_tools(context)}
    result = tools["search_operation_knowledge"].invoke(query="B站标题怎么写", top_k=1)
    assert len(result) == 1
    assert result[0]["payload"]["title"] == "标题写作"


def test_get_trend_data(context):
    tools = {t.name: t for t in build_core_tools(context)}
    result = tools["get_trend_data"].invoke()
    assert isinstance(result, list)


def test_save_and_get_historical_strategy(context):
    tools = {t.name: t for t in build_core_tools(context)}
    tools["save_operation_memory"].invoke(
        account_id="bilibili:90001",
        category="strategy",
        content="每周五发布长视频",
    )
    result = tools["get_historical_strategy"].invoke(account_id="bilibili:90001")
    assert "每周五发布长视频" in result["strategy"]
