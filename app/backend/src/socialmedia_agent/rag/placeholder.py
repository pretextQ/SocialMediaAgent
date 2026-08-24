"""占位实现：保证接口可测、可跑，P2 由 FAISS / 真实 Embedder 替换。

- HashEmbedder：确定性字符哈希向量（仅测试/开发用，不具备语义）。
- InMemoryVectorStore：内存余弦相似度检索（测试用，可保留作轻量后备）。
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

from .embedder import Embedder
from .vector_store import SearchHit, VectorStore


def _cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a)) or 1.0
    norm_b = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (norm_a * norm_b)


@dataclass
class HashEmbedder(Embedder):
    """确定性哈希向量，dim 维；不具备语义相似度，仅供测试/开发。"""

    dim: int = 64

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        result = []
        for text in texts:
            vec = [0.0] * self.dim
            for ch in str(text):
                digest = int(hashlib.md5(ch.encode("utf-8")).hexdigest(), 16)
                vec[digest % self.dim] += 1.0
            result.append(vec)
        return result


class InMemoryVectorStore(VectorStore):
    def __init__(self) -> None:
        self._vectors: dict[str, list[float]] = {}
        self._payloads: dict[str, dict] = {}
        self._seq = 0

    def add(self, vectors: list[list[float]], payloads: list[dict], ids: list[str] | None = None) -> None:
        if len(vectors) != len(payloads):
            raise ValueError("vectors 与 payloads 长度必须一致")
        if ids is None:
            ids = [f"hit-{self._seq + i}" for i in range(len(vectors))]
            self._seq += len(vectors)
        if len(ids) != len(vectors):
            raise ValueError("ids 长度必须与 vectors 一致")
        for vid, vector, payload in zip(ids, vectors, payloads):
            self._vectors[vid] = vector
            self._payloads[vid] = payload

    def search(self, query_vector: list[float], top_k: int = 5) -> list[SearchHit]:
        scored = [(vid, _cosine(query_vector, vec)) for vid, vec in self._vectors.items()]
        scored.sort(key=lambda item: item[1], reverse=True)
        return [
            SearchHit(id=vid, score=score, payload=self._payloads[vid])
            for vid, score in scored[:top_k]
        ]

    def delete(self, ids: list[str]) -> None:
        for vid in ids:
            self._vectors.pop(vid, None)
            self._payloads.pop(vid, None)

    def count(self) -> int:
        return len(self._vectors)
