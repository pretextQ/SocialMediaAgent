"""周报调度生命周期集成测试。

设计要点：调度**默认关闭**（`SMA_SCHEDULER_ENABLED` 未设即 false）。
本地单用户工具不该「启动就悄悄起后台线程」，测试也不该被 lifespan 起的线程拖脆。
本文件验证：默认不启动；显式开启时随 lifespan 启停。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from socialmedia_agent.api import main as api_main
from socialmedia_agent.api.main import create_app
from socialmedia_agent.config import Settings, get_settings
from socialmedia_agent.database.session import Database
from socialmedia_agent.memory.store import build_memory_store


def _enabled_settings() -> Settings:
    return Settings(_env_file=None, scheduler_enabled=True)


def test_scheduler_is_off_by_default(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'sched_off.db'}")
    db.create_all()
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'sched_off_mem.db'}")
    app = create_app(database=db, memory_store=mem)

    with TestClient(app) as client:
        body = client.get("/api/v1/system/status").json()
        assert getattr(app.state, "scheduler", None) is None, "默认不得起调度器"
        assert body["scheduler_enabled"] is False
        assert body["scheduler_running"] is False


def test_scheduler_starts_and_stops_with_lifespan(tmp_path, monkeypatch):
    """显式开启时：lifespan 启动调度器，退出时关闭并清空。"""
    # lifespan 用的是 api.main 里 import 进来的 get_settings
    monkeypatch.setattr(api_main, "get_settings", _enabled_settings)

    db = Database(url=f"sqlite:///{tmp_path / 'sched_on.db'}")
    db.create_all()
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'sched_on_mem.db'}")
    app = create_app(database=db, memory_store=mem)
    # 状态端点走的是依赖注入的 get_settings
    app.dependency_overrides[get_settings] = _enabled_settings

    with TestClient(app) as client:
        scheduler = app.state.scheduler
        assert scheduler is not None
        assert scheduler.running is True
        assert len(scheduler.get_jobs()) == 1

        body = client.get("/api/v1/system/status").json()
        assert body["scheduler_enabled"] is True
        assert body["scheduler_running"] is True

    assert app.state.scheduler is None, "退出后应清空引用，避免误用已关闭的调度器"
