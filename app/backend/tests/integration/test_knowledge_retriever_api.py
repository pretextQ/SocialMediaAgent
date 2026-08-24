"""知识库 retriever 注入 API 测试（TDD，P5.5.4）。

验证：注入已种子的知识库 retriever 后，Agent 能真正查询知识库
（无趋势话题的账号，选题推荐走 RAG 知识库兜底）。
"""

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.rag.faiss_store import FaissVectorStore
from socialmedia_agent.rag.knowledge import KnowledgeDoc, seed_knowledge
from socialmedia_agent.rag.placeholder import HashEmbedder
from socialmedia_agent.rag.retriever import Retriever
from socialmedia_agent.repositories.account_repo import AccountRepository


def _make_retriever():
    embedder = HashEmbedder(dim=256)
    store = FaissVectorStore()
    seed_knowledge(
        store,
        embedder,
        [
            KnowledgeDoc(
                id="k1",
                title="AI 工具测评方向",
                content="AI 工具测评是高互动选题方向",
            )
        ],
    )
    return Retriever(embedder=embedder, store=store)


def test_api_topic_recommendation_uses_knowledge_retriever(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'kb.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )

    app = create_app(database=db, retriever=_make_retriever())
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/bilibili:90001/topic-recommendation")
    db.engine.dispose()
    assert resp.status_code == 200
    topics = resp.json()["recommendation"]["topics"]
    assert topics, "知识库候选应产生推荐选题"
    assert topics[0]["title"] == "AI 工具测评方向"
    assert "知识库" in topics[0]["rationale"]
