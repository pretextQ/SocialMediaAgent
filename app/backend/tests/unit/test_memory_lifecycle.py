"""Memory store 的 session 生命周期（技术债）。

**问题**：`build_memory_store()` 只创建一个 Session 并交给调用方长期持有。API 把它缓存在
`app.state` 上，而 FastAPI 的**同步端点在（多）线程池里执行**——等于多线程并发共用一个
**非线程安全**的 Session。引擎也从没有人 `dispose()`。

（注意：`create_db_engine` 的 `check_same_thread=False` 只解决 **DBAPI 连接**跨线程，
不代表 Session 可以并发共用。）

**修复**：改用 `scoped_session`（每线程一个 Session），并提供 `dispose()` 收口生命周期。
"""

import threading
from datetime import datetime, timezone

from socialmedia_agent.memory.models import MemoryCategory, MemoryEntry
from socialmedia_agent.memory.store import build_memory_store

NOW = datetime.now(timezone.utc)


def test_memory_store_session_is_thread_local(tmp_path):
    """必须是 scoped_session：否则线程池会并发共用一个 Session。"""
    store = build_memory_store(f"sqlite:///{tmp_path / 'mem.db'}")
    try:
        assert hasattr(store.session, "registry"), (
            "build_memory_store 应返回 scoped_session（线程局部）；"
            "单个长期存活的 Session 会被 FastAPI 线程池并发使用"
        )
    finally:
        store.dispose()


def test_dispose_is_idempotent(tmp_path):
    store = build_memory_store(f"sqlite:///{tmp_path / 'mem.db'}")

    store.dispose()
    store.dispose()

    assert store._engine is None


def test_concurrent_writes_are_not_lost(tmp_path):
    """多线程各写一条：不抛异常、不丢数据（每线程独立 Session）。"""
    store = build_memory_store(f"sqlite:///{tmp_path / 'mem.db'}")
    errors: list[Exception] = []

    def worker(index: int) -> None:
        try:
            store.add(
                MemoryEntry(
                    account_id=f"acct:{index}",
                    category=MemoryCategory.STRATEGY,
                    content=f"策略 {index}",
                    created_at=NOW,
                )
            )
        except Exception as exc:  # noqa: BLE001 - 收集后统一断言
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    try:
        assert errors == []
        assert store.count() == 4
    finally:
        store.dispose()
