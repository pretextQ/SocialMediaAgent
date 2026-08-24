"""FAISS VectorStore + Retriever 单元测试（TDD）。

用确定性 HashEmbedder 做召回断言：加知识文档，查询相关文本，top1 命中正确文档。
"""

import pytest

from socialmedia_agent.rag import HashEmbedder
from socialmedia_agent.rag.faiss_store import FaissVectorStore
from socialmedia_agent.rag.retriever import Retriever
from socialmedia_agent.rag.vector_store import VectorStore


@pytest.fixture
def store():
    return FaissVectorStore()


@pytest.fixture
def embedder():
    return HashEmbedder(dim=64)


def test_faiss_is_a_vector_store(store):
    assert isinstance(store, VectorStore)


def test_add_search_and_count(store, embedder):
    vecs = embedder.embed_texts(["小红书涨粉技巧", "抖音热门话题", "B站剪辑教程"])
    store.add(vecs, [{"title": t} for t in ["小红书涨粉技巧", "抖音热门话题", "B站剪辑教程"]])
    assert store.count() == 3


def test_search_returns_most_similar_first(store, embedder):
    store.add(
        embedder.embed_texts(["如何做短视频标题", "电商直播带货策略", "小红书爆款笔记封面"]),
        [{"tag": "title"}, {"tag": "live"}, {"tag": "cover"}],
        ids=["a", "b", "c"],
    )
    hits = store.search(embedder.embed_query("标题怎么写"), top_k=1)
    assert len(hits) == 1
    assert hits[0].payload["tag"] == "title"
    assert hits[0].score > 0


def test_search_respects_top_k_order(store, embedder):
    store.add(
        embedder.embed_texts(["内容A", "内容B", "内容C"]),
        [{"id": i} for i in range(3)],
        ids=["x", "y", "z"],
    )
    hits = store.search(embedder.embed_query("内容A"), top_k=2)
    assert len(hits) == 2
    assert hits[0].id == "x"
    assert all(hits[i].score >= hits[i + 1].score for i in range(len(hits) - 1))


def test_delete_removes_vectors(store, embedder):
    store.add(embedder.embed_texts(["A", "B"]), [{"n": 1}, {"n": 2}], ids=["a", "b"])
    store.delete(["a"])
    assert store.count() == 1
    hits = store.search(embedder.embed_query("A"), top_k=5)
    assert all(h.id != "a" for h in hits)


def test_add_length_mismatch_rejected(store, embedder):
    with pytest.raises(ValueError):
        store.add(embedder.embed_texts(["A"]), [{"n": 1}, {"n": 2}])


def test_empty_store_search_returns_empty(store, embedder):
    assert store.search(embedder.embed_query("任何"), top_k=3) == []
    assert store.count() == 0


def test_retriever_recalls_matching_document(store, embedder):
    """召回断言：加入知识文档后，相关查询能命中对应文档。"""
    docs = [
        {"title": "B站标题写作方法", "content": "开头3秒钩子，标题带具体数字与情绪词"},
        {"title": "小红书封面制作", "content": "封面用高对比色块 + 大字标题"},
        {"title": "抖音直播话术", "content": "限时福利、倒计时、关注引导"},
    ]
    store.add(embedder.embed_texts([d["title"] + d["content"] for d in docs]),
              docs, ids=["d1", "d2", "d3"])

    retriever = Retriever(embedder=embedder, store=store)
    hits = retriever.retrieve("B站视频标题怎么起", top_k=1)
    assert len(hits) == 1
    assert hits[0].id == "d1"
    assert hits[0].payload["title"].startswith("B站")


def test_retriever_topk_respects_order(store, embedder):
    docs = [
        {"title": "短视频标题技巧A", "content": "数字、悬念、情绪"},
        {"title": "笔记封面B", "content": "色块大字"},
        {"title": "直播话术C", "content": "倒计时"},
    ]
    store.add(embedder.embed_texts([d["title"] for d in docs]), docs, ids=["a", "b", "c"])
    retriever = Retriever(embedder=embedder, store=store)
    hits = retriever.retrieve("短视频标题", top_k=2)
    assert len(hits) == 2
    assert hits[0].id == "a"
    assert hits[1].score <= hits[0].score
