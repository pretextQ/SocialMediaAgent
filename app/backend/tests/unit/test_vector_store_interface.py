import pytest

from socialmedia_agent.rag import HashEmbedder, InMemoryVectorStore


def test_embedder_deterministic_and_dim():
    e = HashEmbedder(dim=64)
    v1 = e.embed_texts(["运营知识"])
    v2 = e.embed_texts(["运营知识"])
    assert v1 == v2
    assert len(v1[0]) == 64
    assert e.embed_query("运营知识") == v1[0]


def test_inmemory_add_search_and_count():
    store = InMemoryVectorStore()
    e = HashEmbedder()
    vecs = e.embed_texts(["小红书涨粉技巧", "抖音热门话题", "B站剪辑教程"])
    store.add(vecs, [{"title": t} for t in ["小红书涨粉技巧", "抖音热门话题", "B站剪辑教程"]])
    assert store.count() == 3


def test_search_returns_most_similar_first():
    store = InMemoryVectorStore()
    e = HashEmbedder()
    store.add(
        e.embed_texts(["如何做短视频标题", "电商直播带货策略", "小红书爆款笔记封面"]),
        [{"tag": "title"}, {"tag": "live"}, {"tag": "cover"}],
        ids=["a", "b", "c"],
    )
    hits = store.search(e.embed_query("标题怎么写"), top_k=1)
    assert len(hits) == 1
    assert hits[0].payload["tag"] == "title"
    assert hits[0].score > 0


def test_search_respects_top_k_order():
    store = InMemoryVectorStore()
    e = HashEmbedder()
    store.add(
        e.embed_texts(["内容A", "内容B", "内容C"]),
        [{"id": i} for i in range(3)],
        ids=["x", "y", "z"],
    )
    hits = store.search(e.embed_query("内容A"), top_k=2)
    assert len(hits) == 2
    assert hits[0].id == "x"
    assert all(hits[i].score >= hits[i + 1].score for i in range(len(hits) - 1))


def test_delete_removes_vectors():
    store = InMemoryVectorStore()
    e = HashEmbedder()
    store.add(e.embed_texts(["A", "B"]), [{"n": 1}, {"n": 2}], ids=["a", "b"])
    store.delete(["a"])
    assert store.count() == 1
    hits = store.search(e.embed_query("A"), top_k=5)
    assert all(h.id != "a" for h in hits)


def test_add_length_mismatch_rejected():
    store = InMemoryVectorStore()
    e = HashEmbedder()
    with pytest.raises(ValueError):
        store.add(e.embed_texts(["A"]), [{"n": 1}, {"n": 2}])
