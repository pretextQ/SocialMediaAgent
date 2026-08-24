"""Memory（账号历史运营特征）单元测试（TDD）。

覆盖：
- 存/取：add 后可按账号 list，携带 category/content
- TTL：过期条目不返回
- 摘要：Summarizer 按 category 聚合账号特征
- 独立存储：与 RAG/核心库物理分离（独立 engine）
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import sessionmaker

from socialmedia_agent.database.engine import create_db_engine
from socialmedia_agent.memory.models import MemoryCategory, MemoryEntry
from socialmedia_agent.memory.store import (
    SQLAlchemyMemoryStore,
)
from socialmedia_agent.memory.summarizer import Summarizer

NOW = datetime(2026, 8, 24, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def store(tmp_path):
    engine = create_db_engine(f"sqlite:///{tmp_path / 'memory.db'}")
    SQLAlchemyMemoryStore.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        yield SQLAlchemyMemoryStore(session)
    engine.dispose()


def make_entry(
    account_id: str = "bilibili:90001",
    category: MemoryCategory = MemoryCategory.POSITIONING,
    content: str = "知识区干货",
    created_at: datetime = NOW,
    expires_at: datetime | None = None,
) -> MemoryEntry:
    return MemoryEntry(
        account_id=account_id,
        category=category,
        content=content,
        created_at=created_at,
        expires_at=expires_at,
    )


def test_add_and_list_by_account(store):
    store.add(make_entry(content="科技测评"))
    store.add(make_entry(account_id="bilibili:90002", content="美食探店"))
    entries = store.list_for_account("bilibili:90001")
    assert len(entries) == 1
    assert entries[0].content == "科技测评"
    assert entries[0].category == MemoryCategory.POSITIONING


def test_list_filters_by_category(store):
    store.add(make_entry(category=MemoryCategory.POSITIONING, content="定位A"))
    store.add(make_entry(category=MemoryCategory.STRATEGY, content="策略B"))
    entries = store.list_for_account("bilibili:90001", category=MemoryCategory.STRATEGY)
    assert len(entries) == 1
    assert entries[0].content == "策略B"


def test_ttl_expired_entries_not_returned(store):
    store.add(
        make_entry(
            content="已过期特征",
            expires_at=NOW - timedelta(days=1),
        )
    )
    store.add(make_entry(content="有效特征", expires_at=NOW + timedelta(days=30)))
    entries = store.list_for_account("bilibili:90001")
    assert len(entries) == 1
    assert entries[0].content == "有效特征"


def test_count_and_delete(store):
    e1 = store.add(make_entry(content="A"))
    store.add(make_entry(content="B"))
    assert store.count() == 2
    store.delete(e1.id)
    assert store.count() == 1
    assert all(e.content != "A" for e in store.list_for_account("bilibili:90001"))


def test_summarizer_groups_by_category():
    summarizer = Summarizer()
    entries = [
        make_entry(category=MemoryCategory.POSITIONING, content="科技测评定位"),
        make_entry(category=MemoryCategory.POSITIONING, content="深度评测"),
        make_entry(category=MemoryCategory.STRATEGY, content="每周五发布"),
    ]
    summary = summarizer.summarize(entries)
    assert "positioning" in summary
    assert "strategy" in summary
    assert "科技测评定位" in summary["positioning"]
    assert "深度评测" in summary["positioning"]
    assert "每周五发布" in summary["strategy"]


def test_summarizer_empty_returns_empty():
    summarizer = Summarizer()
    assert summarizer.summarize([]) == {}


def test_memory_store_is_separate_from_core_db(tmp_path):
    """独立 DB：Memory 的建表不依赖核心库 Base。"""
    from socialmedia_agent.models import Base as CoreBase
    from socialmedia_agent.memory.store import MemoryBase

    assert CoreBase is not MemoryBase
