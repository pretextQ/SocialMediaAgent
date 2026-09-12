"""评测 runner 集成测试（TDD，M3）。

覆盖：
- load_cases 读取 JSON
- run_case(llm)：用实测工具序列评分
- run_case(rules)：确定性路径（gateway=None）
- run_suite：两种模式同批对照
- render_markdown：报告包含关键指标
- **两条路径都不重复取数**（回归）：修复确定性 gather 的重复取数后，rules 与 llm 均为 0；
  「指标本身能识别重复」由 unit/test_eval_tool_selection.py 覆盖
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
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.evaluation.models import EvalCase
from socialmedia_agent.evaluation.runner import (
    load_cases,
    render_markdown,
    run_case,
    run_suite,
)
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import (
    ProviderToolCall,
    ProviderToolResult,
    ToolCallingProvider,
)
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

AID = "bilibili:90001"

# 确定性 gather 覆盖的 6 个工具（该清单由 run_case 实测得到，这里用作"标准答案"）
DETERMINISTIC_TOOLS = [
    "get_account_profile",
    "analyze_content_performance",
    "get_recent_contents",
    "get_historical_strategy",
    "get_trend_data",
    "search_operation_knowledge",
]


def seed_db(tmp_path) -> Database:
    db = Database(url=f"sqlite:///{tmp_path / 'eval.db'}")
    db.create_all()
    now = datetime.now(timezone.utc)
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        content = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI, platform_content_id="a1", account_id=AID,
                title="内容一", content_type=ContentType.VIDEO, publish_time=now,
            )
        )
        MetricRepository(session).upsert(
            Metric(
                content_id=content.canonical_id, account_id=AID, platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS, value=Decimal("1000"),
                captured_at=now, source=MetricSource.SYNTHETIC,
            )
        )
        TopicRepository(session).upsert(
            Topic(keyword="效率工具测评", platforms=[Platform.BILIBILI], last_seen=now, post_count=42)
        )
    return db


def make_memory(tmp_path) -> SQLAlchemyMemoryStore:
    engine = create_db_engine(f"sqlite:///{tmp_path / 'mem.db'}")
    SQLAlchemyMemoryStore.create_all(engine)
    return SQLAlchemyMemoryStore(sessionmaker(bind=engine, expire_on_commit=False)())


def make_registry(db, memory):
    return build_registry(db, retriever=None, memory_store=memory, summarizer=Summarizer())


class ScriptedToolProvider(ToolCallingProvider):
    def __init__(self, script):
        self.script = list(script)

    def complete(self, messages, response_format="text"):
        return json.dumps({
            "account_id": AID, "account_health": 70,
            "strengths": [], "weaknesses": [], "anomalies": [], "recommendations": [],
            "strategy_summary": "模型给的摘要",
            "weekly_plan": [], "kpis": [], "risks": [],
        }, ensure_ascii=False)

    def complete_with_tools(self, messages, tools):
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def make_gateway(provider):
    return LLMGateway(
        provider=provider,
        breaker=CircuitBreaker(name="t", failure_threshold=99, recovery_timeout=60),
    )


def args_for(name):
    if name == "get_recent_contents":
        return {"account_id": AID, "limit": 5}
    if name == "get_trend_data":
        return {"platform": "bilibili", "period": 7}
    if name == "search_operation_knowledge":
        return {"query": "运营策略", "top_k": 3}
    return {"account_id": AID}


def call(name):
    return ProviderToolResult(
        tool_calls=[ProviderToolCall(id=f"c-{name}", name=name, arguments=args_for(name))]
    )


def final(text="ok"):
    return ProviderToolResult(content=text, tool_calls=[])


def test_load_cases_reads_json(tmp_path):
    path = tmp_path / "cases.json"
    path.write_text(json.dumps([{
        "id": "healthy", "account_id": AID,
        "expected_tools": DETERMINISTIC_TOOLS, "note": "全量工具",
    }], ensure_ascii=False), encoding="utf-8")

    cases = load_cases(path)

    assert len(cases) == 1
    assert cases[0].id == "healthy"
    assert cases[0].account_id == AID
    assert cases[0].expected_tools == DETERMINISTIC_TOOLS
    assert cases[0].note == "全量工具"


def test_run_case_llm_mode_scores_actual_tool_sequence(tmp_path):
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    provider = ScriptedToolProvider([call(n) for n in DETERMINISTIC_TOOLS] + [final()])
    case = EvalCase(id="c1", account_id=AID, expected_tools=DETERMINISTIC_TOOLS)

    outcome = run_case(case, registry, make_gateway(provider), mode="llm")

    assert outcome.mode == "llm"
    assert outcome.source == "llm"
    assert outcome.tool_trace == DETERMINISTIC_TOOLS
    assert outcome.score.exact_match is True
    assert outcome.score.duplicate_calls == 0


def test_run_case_rules_mode_measures_deterministic_path(tmp_path):
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    case = EvalCase(id="c1", account_id=AID, expected_tools=DETERMINISTIC_TOOLS)

    outcome = run_case(case, registry, None, mode="rules")

    assert outcome.source == "rules"
    assert set(outcome.tool_trace) == set(DETERMINISTIC_TOOLS)
    assert outcome.score.recall == 1.0


def test_run_suite_compares_both_modes(tmp_path):
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    provider = ScriptedToolProvider([call(n) for n in DETERMINISTIC_TOOLS] + [final()])
    cases = [EvalCase(id="c1", account_id=AID, expected_tools=DETERMINISTIC_TOOLS)]

    report = run_suite(cases, registry, make_gateway(provider), modes=("rules", "llm"))

    by_mode = {s.mode: s for s in report.summaries}
    assert set(by_mode) == {"rules", "llm"}
    assert by_mode["llm"].case_count == 1
    assert by_mode["llm"].runs == 1
    assert by_mode["llm"].mean_exact_match_rate == 1.0
    assert by_mode["llm"].total_duplicate_calls == 0
    # 回归：确定性 gather 曾重复取 profile/recent/trends，修复后必须为 0
    # （「指标本身能识别重复」由 unit/test_eval_tool_selection.py 覆盖，保护不丢）
    assert by_mode["rules"].total_duplicate_calls == 0
    assert len(report.outcomes) == 2


def test_render_markdown_reports_metrics(tmp_path):
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    cases = [EvalCase(id="c1", account_id=AID, expected_tools=DETERMINISTIC_TOOLS)]
    report = run_suite(cases, registry, None, modes=("rules",))

    md = render_markdown(report)

    assert "工具选择" in md
    assert "rules" in md
    assert "recall" in md.lower()


def test_run_suite_repeats_each_case_and_reports_runs(tmp_path):
    """--runs N：同一用例重复 N 轮，逐轮记录 run_index，并报告总体标准差。"""
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    case = EvalCase(id="c1", account_id=AID, expected_tools=DETERMINISTIC_TOOLS)

    report = run_suite([case], registry, None, modes=("rules",), runs=3)

    assert len(report.outcomes) == 3
    assert sorted(o.run_index for o in report.outcomes) == [0, 1, 2]
    summary = report.summaries[0]
    assert summary.runs == 3
    assert summary.case_count == 1
    # 确定性路径逐轮完全一致 -> 方差为 0（"方差为 0" 本身是有信息量的结论）
    assert summary.std_recall == pytest.approx(0.0)
    assert summary.std_duplicate_calls == pytest.approx(0.0)


def test_run_suite_reports_variance_across_llm_runs(tmp_path):
    """LLM 路径逐轮可能不同：均值与方差必须如实反映，而不是只报单次结果。"""
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    provider = ScriptedToolProvider([
        call("get_account_profile"),
        final(),  # 轮0：只调 1 个工具
        call("get_account_profile"),
        call("get_trend_data"),
        final(),  # 轮1：调 2 个工具
    ])
    case = EvalCase(id="c1", account_id=AID, expected_tools=DETERMINISTIC_TOOLS)

    report = run_suite([case], registry, make_gateway(provider), modes=("llm",), runs=2)

    summary = report.summaries[0]
    assert summary.runs == 2
    # recall 分别为 1/6、2/6 -> 均值 0.25，总体标准差 = (2/6 - 1/6) / 2
    assert summary.mean_recall == pytest.approx(0.25)
    assert summary.std_recall == pytest.approx((2 / 6 - 1 / 6) / 2)
    assert summary.std_recall > 0


def test_render_markdown_reports_runs_and_variance(tmp_path):
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    case = EvalCase(id="c1", account_id=AID, expected_tools=DETERMINISTIC_TOOLS)

    md = render_markdown(run_suite([case], registry, None, modes=("rules",), runs=2))

    assert "轮次" in md
    assert "±" in md
