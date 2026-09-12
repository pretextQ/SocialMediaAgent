"""数据准确性 runner 集成测试（TDD，P6）。

覆盖：加载用例、对 account / content 两类目标跑 Agent 并给「数字是否有出处」打分、
汇总与 Markdown 渲染。用 gateway=None（确定性规则路径）验证链路本身不产生编造。
"""

import json
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import sessionmaker

from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.database.engine import create_db_engine
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.evaluation.grounding_runner import (
    load_cases,
    render_markdown,
    run_suite,
)
from socialmedia_agent.evaluation.models import GroundingCase
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository

AID = "bilibili:90001"
CID = "bilibili:1001"


def seed(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'ground.db'}")
    db.create_all()
    now = datetime.now(timezone.utc)
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI, platform_content_id="1001", account_id=AID,
                title="人工智能入门", content_type=ContentType.VIDEO, publish_time=now,
            )
        )
        MetricRepository(session).upsert(
            Metric(
                content_id=CID, account_id=AID, platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS, value=Decimal("1500"),
                captured_at=now, source=MetricSource.MANUAL,
            )
        )
    engine = create_db_engine(f"sqlite:///{tmp_path / 'ground_mem.db'}")
    SQLAlchemyMemoryStore.create_all(engine)
    memory = SQLAlchemyMemoryStore(sessionmaker(bind=engine, expire_on_commit=False)())
    return build_registry(db, retriever=None, memory_store=memory, summarizer=Summarizer())


def test_load_cases_reads_json(tmp_path):
    path = tmp_path / "cases.json"
    path.write_text(json.dumps([
        {"id": "a1", "kind": "account", "target_id": AID, "note": "账号"}
    ], ensure_ascii=False), encoding="utf-8")

    cases = load_cases(path)

    assert len(cases) == 1
    assert cases[0].kind == "account"
    assert cases[0].target_id == AID


def test_run_suite_scores_account_and_content(tmp_path):
    registry = seed(tmp_path)
    cases = [
        GroundingCase(id="a1", kind="account", target_id=AID),
        GroundingCase(id="c1", kind="content", target_id=CID),
    ]

    report = run_suite(cases, registry, gateway=None)

    assert report.case_count == 2
    # 规则路径完全由 facts 生成，不应出现任何无出处的数字
    assert report.ungrounded_count == 0
    assert report.mean_grounded_rate == 1.0


def test_run_suite_repeats_and_reports_runs(tmp_path):
    """LLM 温度 > 0：单轮 grounding 结果不足以作为结论，必须多轮并报告方差。"""
    registry = seed(tmp_path)
    cases = [GroundingCase(id="a1", kind="account", target_id=AID)]

    report = run_suite(cases, registry, gateway=None, runs=3)

    assert report.runs == 3
    assert len(report.outcomes) == 3
    assert sorted(o.run_index for o in report.outcomes) == [0, 1, 2]
    assert report.std_grounded_rate == pytest.approx(0.0)


def test_render_markdown_reports_metrics(tmp_path):
    registry = seed(tmp_path)
    cases = [GroundingCase(id="a1", kind="account", target_id=AID)]

    md = render_markdown(run_suite(cases, registry, gateway=None))

    assert "数据准确性" in md
    assert "出处" in md or "grounded" in md.lower()


def test_unknown_kind_raises(tmp_path):
    registry = seed(tmp_path)
    with pytest.raises(ValueError, match="kind"):
        run_suite([GroundingCase(id="x", kind="topic", target_id="t")], registry, gateway=None)
