"""Topic Recommendation 内部能力测试（TDD，P5.5.1 降级后）。

覆盖：
- TopicRecommendationOutput 严格 schema（account_id 必填，estimated_interest 0-100）
- 规则兜底：趋势话题候选（DB 事实）优先，与已有内容标题精确去重
- 无趋势候选 → RAG 知识库标题兜底
- 无任何候选 → topics=[]
- e2e：LLM 输出经硬去重过滤（重复已有标题被剔除）
- LLM 失败 → 规则兜底仍满足 schema
- 统计注入可核验
"""

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.topic_recommendation import nodes as topic_capability
from socialmedia_agent.agents.topic_recommendation.schemas import TopicRecommendationOutput
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, Platform
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import LLMProvider
from socialmedia_agent.rag import HashEmbedder, InMemoryVectorStore, Retriever
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

NOW = datetime.now(timezone.utc)


def seed_db(tmp_path) -> Database:
    db = Database(url=f"sqlite:///{tmp_path / 'rec.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        AccountRepository(session).upsert(
            Account(platform=Platform.WEIBO, platform_id="90002", nickname="微博博主B")
        )
        ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id="bilibili:90001",
                title="AI 绘画",
                content_type=ContentType.VIDEO,
            )
        )
        ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1002",
                account_id="bilibili:90001",
                title="职场效率工具",
                content_type=ContentType.VIDEO,
            )
        )
        repo = TopicRepository(session)
        repo.upsert(Topic(keyword="效率工具测评", platforms=[Platform.BILIBILI], last_seen=NOW, post_count=50))
        repo.upsert(Topic(keyword="AI 绘画", platforms=[Platform.BILIBILI], last_seen=NOW, post_count=100))
    return db


def make_registry(tmp_path, with_rag: bool = True) -> ToolRegistry:
    db = seed_db(tmp_path)
    retriever = None
    if with_rag:
        store = InMemoryVectorStore()
        emb = HashEmbedder(dim=64)
        store.add(
            emb.embed_texts(["AI 工具测评是平台近期高互动选题方向"]),
            [{"title": "AI 工具测评方向", "content": "AI 工具测评是平台近期高互动选题方向"}],
            ids=["k1"],
        )
        retriever = Retriever(embedder=emb, store=store)
    reg = ToolRegistry()
    for tool in build_core_tools(ToolContext(database=db, retriever=retriever)):
        reg.register(tool)
    return reg


def run(reg, gateway, account_id):
    facts = topic_capability.gather(reg, account_id)
    out = topic_capability.analyze(gateway, facts)
    return out, topic_capability.render_report(out, facts), facts


class ScriptedProvider(LLMProvider):
    def __init__(self, script: list[str]) -> None:
        self.script = script
        self.last_user_content: str | None = None

    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        self.last_user_content = messages[-1]["content"]
        return self.script.pop(0)


def make_gateway(provider: LLMProvider) -> LLMGateway:
    return LLMGateway(
        provider=provider,
        breaker=CircuitBreaker(name="rec", failure_threshold=3, recovery_timeout=60),
    )


def test_topic_recommendation_output_schema_strict():
    out = TopicRecommendationOutput(
        account_id="bilibili:90001",
        topics=[{"title": "效率工具测评", "rationale": "平台热门", "estimated_interest": 80}],
    )
    assert out.topics[0].estimated_interest == 80

    with pytest.raises(ValidationError):
        TopicRecommendationOutput(
            account_id="x",
            topics=[{"title": "t", "rationale": "r", "estimated_interest": 150}],
        )
    with pytest.raises(ValidationError):
        TopicRecommendationOutput(  # account_id 必填
            topics=[{"title": "t", "rationale": "r", "estimated_interest": 50}],
        )


def test_rule_fallback_uses_trend_topics_deduped(tmp_path):
    """趋势候选优先；与已有内容标题（AI 绘画）精确去重。"""
    reg = make_registry(tmp_path)
    out, report, _ = run(reg, None, "bilibili:90001")
    assert [t.title for t in out.topics] == ["效率工具测评"]
    topic = out.topics[0]
    assert topic.estimated_interest == 80  # min(100, 30+min(70, 50))
    assert "50" in topic.rationale
    assert report


def test_rule_fallback_uses_knowledge_when_no_trend(tmp_path):
    """无趋势候选时用 RAG 知识库标题兜底。"""
    reg = make_registry(tmp_path)
    out, _, _ = run(reg, None, "weibo:90002")
    assert [t.title for t in out.topics] == ["AI 工具测评方向"]
    assert out.topics[0].estimated_interest == 60
    assert "知识库" in out.topics[0].rationale


def test_empty_when_no_candidates(tmp_path):
    """无趋势、无知识、无已有内容 → topics=[]（诚实兜底）。"""
    db = Database(url=f"sqlite:///{tmp_path / 'rec_empty.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.ZHIHU, platform_id="90003", nickname="知乎博主C")
        )
    reg = ToolRegistry()
    for tool in build_core_tools(ToolContext(database=db, retriever=None)):
        reg.register(tool)
    out, report, _ = run(reg, None, "zhihu:90003")
    assert out.topics == []
    assert report


def test_e2e_hard_dedup_of_llm_topics(tmp_path):
    """LLM 返回重复已有标题的选题 → 硬去重剔除。"""
    reg = make_registry(tmp_path)
    provider = ScriptedProvider(
        [
            '{"account_id": "bilibili:90001", "topics": ['
            '{"title": "AI 绘画", "rationale": "编造重复", "estimated_interest": 90},'
            '{"title": "AI 芯片投资机会", "rationale": "结合趋势与知识库", "estimated_interest": 85}]}'
        ]
    )
    out, report, _ = run(reg, make_gateway(provider), "bilibili:90001")
    assert [t.title for t in out.topics] == ["AI 芯片投资机会"]
    assert out.topics[0].estimated_interest == 85
    assert report


def test_llm_failure_falls_back_to_rules(tmp_path):
    reg = make_registry(tmp_path)
    provider = ScriptedProvider(["not-json"])
    out, report, _ = run(reg, make_gateway(provider), "bilibili:90001")
    assert [t.title for t in out.topics] == ["效率工具测评"]
    assert all(0 <= t.estimated_interest <= 100 for t in out.topics)
    assert report


def test_statistics_injected_into_prompt(tmp_path):
    """趋势话题、已有内容标题、知识库标题必须注入 LLM prompt。"""
    reg = make_registry(tmp_path)
    provider = ScriptedProvider(['{"account_id": "bilibili:90001", "topics": []}'])
    run(reg, make_gateway(provider), "bilibili:90001")
    assert "效率工具测评" in provider.last_user_content
    assert "AI 绘画" in provider.last_user_content
    assert "AI 工具测评方向" in provider.last_user_content
