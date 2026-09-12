"""输出质量 runner 集成测试（TDD，P6）。

用脚本化 provider 区分「被测 Agent 的调用」与「评委的调用」，验证多轮聚合与渲染。
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
from socialmedia_agent.evaluation.models import QualityCase
from socialmedia_agent.evaluation.quality_runner import (
    load_cases,
    render_markdown,
    run_suite,
)
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import LLMProvider
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository

AID = "bilibili:90001"

AGENT_PAYLOAD = json.dumps({
    "account_id": AID,
    "account_health": 70,
    "strengths": ["更新稳定"],
    "weaknesses": [],
    "anomalies": [],
    "recommendations": ["保持节奏"],
    "strategy_summary": "维持现有更新节奏",
    "weekly_plan": ["每周 2 条"],
    "kpis": ["月播放提升 20%"],
    "risks": ["同质化"],
}, ensure_ascii=False)

JUDGE_PAYLOAD = json.dumps({
    "specificity": 80, "structure": 70, "conciseness": 60,
    "overall": 72, "rationale": "ok",
}, ensure_ascii=False)


class ScriptedProvider(LLMProvider):
    """按 system prompt 区分评委与被测 Agent。"""

    def __init__(self):
        self.judge_calls = 0
        self.agent_calls = 0

    def complete(self, messages, response_format: str = "text") -> str:
        system = messages[0]["content"]
        if "评审" in system:
            self.judge_calls += 1
            return JUDGE_PAYLOAD
        self.agent_calls += 1
        return AGENT_PAYLOAD


def seed(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'quality.db'}")
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
                content_id="bilibili:1001", account_id=AID, platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS, value=Decimal("1500"),
                captured_at=now, source=MetricSource.MANUAL,
            )
        )
    engine = create_db_engine(f"sqlite:///{tmp_path / 'quality_mem.db'}")
    SQLAlchemyMemoryStore.create_all(engine)
    memory = SQLAlchemyMemoryStore(sessionmaker(bind=engine, expire_on_commit=False)())
    return build_registry(db, retriever=None, memory_store=memory, summarizer=Summarizer())


def make_gateway(provider) -> LLMGateway:
    return LLMGateway(
        provider=provider,
        breaker=CircuitBreaker(name="q", failure_threshold=99, recovery_timeout=60),
    )


def test_load_cases_reads_json(tmp_path):
    path = tmp_path / "cases.json"
    path.write_text(json.dumps([
        {"id": "a1", "kind": "account", "target_id": AID}
    ], ensure_ascii=False), encoding="utf-8")

    cases = load_cases(path)

    assert cases[0].kind == "account"


def test_run_suite_repeats_and_averages_judge_scores(tmp_path):
    registry = seed(tmp_path)
    provider = ScriptedProvider()
    cases = [QualityCase(id="a1", kind="account", target_id=AID)]

    report = run_suite(cases, registry, make_gateway(provider), runs=2)

    assert report.runs == 2
    assert len(report.outcomes) == 2
    assert report.mean_overall == pytest.approx(72.0)
    assert report.std_overall == pytest.approx(0.0)
    assert provider.judge_calls == 2
    assert provider.agent_calls == 2


def test_render_markdown_reports_scores(tmp_path):
    registry = seed(tmp_path)
    cases = [QualityCase(id="a1", kind="account", target_id=AID)]

    md = render_markdown(run_suite(cases, registry, make_gateway(ScriptedProvider()), runs=1))

    assert "输出质量" in md
    assert "overall" in md.lower()
    assert "不是 ground truth" in md


def test_missing_gateway_is_rejected(tmp_path):
    registry = seed(tmp_path)
    with pytest.raises(ValueError, match="gateway"):
        run_suite([QualityCase(id="a1", kind="account", target_id=AID)], registry, None, runs=1)
