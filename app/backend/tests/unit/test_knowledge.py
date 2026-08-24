"""运营知识库 seed 测试（TDD，P5.5.4）。

覆盖：
- load_seed_docs 解析 Markdown 种子（## 标题 + 正文块）
- seed_knowledge 嵌入写入 → Retriever 可召回
- build_embedder：默认 HashEmbedder；配置嵌入模型+密钥 → OpenAICompatEmbedder
- build_knowledge_retriever：文件不存在返回空库
"""

import pytest

from socialmedia_agent.config import Settings
from socialmedia_agent.rag.embedder import OpenAICompatEmbedder
from socialmedia_agent.rag.faiss_store import FaissVectorStore
from socialmedia_agent.rag.knowledge import (
    KnowledgeDoc,
    build_embedder,
    build_knowledge_retriever,
    load_seed_docs,
    seed_knowledge,
)
from socialmedia_agent.rag.placeholder import HashEmbedder
from socialmedia_agent.rag.retriever import Retriever


SEED_TEXT = """## 标题写作方法
标题写作：开头3秒钩子 + 数字 + 情绪词，提升点击率。

## 选题方向
科技科普、AI 工具测评、编程实战是高互动选题方向。
"""


def test_load_seed_docs_parses_markdown(tmp_path):
    p = tmp_path / "seed.md"
    p.write_text(SEED_TEXT, encoding="utf-8")
    docs = load_seed_docs(p)
    assert [d.title for d in docs] == ["标题写作方法", "选题方向"]
    assert "开头3秒钩子" in docs[0].content
    assert docs[0].id  # 非空 id
    # 纯标题无正文的块被跳过
    p2 = tmp_path / "empty.md"
    p2.write_text("## 无内容块\n", encoding="utf-8")
    assert load_seed_docs(p2) == []


def test_seed_knowledge_then_retrieve(tmp_path):
    store = FaissVectorStore()
    embedder = HashEmbedder(dim=256)
    docs = [
        KnowledgeDoc(id="k1", title="标题写作方法", content="标题写作：开头3秒钩子 + 数字 + 情绪词"),
        KnowledgeDoc(id="k2", title="选题方向", content="AI 工具测评是高互动选题方向"),
    ]
    count = seed_knowledge(store, embedder, docs)
    assert count == 2
    retriever = Retriever(embedder=embedder, store=store)
    hits = retriever.retrieve("标题怎么写", top_k=1)
    assert hits[0].id == "k1"


def test_build_embedder_default_is_hash():
    s = Settings(_env_file=None)
    assert isinstance(build_embedder(s), HashEmbedder)


def test_build_embedder_openai_when_configured(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-test")
    monkeypatch.setenv("SMA_EMBEDDING_MODEL", "BAAI/bge-m3")
    s = Settings(_env_file=None)
    assert isinstance(build_embedder(s), OpenAICompatEmbedder)


def test_build_knowledge_retriever_missing_store_returns_empty(tmp_path):
    s = Settings(_env_file=None, knowledge_store_path=str(tmp_path / "none.index"))
    retriever = build_knowledge_retriever(s)
    assert isinstance(retriever, Retriever)
    assert retriever.store.count() == 0
