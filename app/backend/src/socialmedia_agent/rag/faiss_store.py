"""FAISS 向量库实现（P2，Phase1 VectorStore 实现）。

用归一化向量 + IndexFlatIP（内积即余弦相似度），支持 add/search/delete/count。
业务层只依赖 VectorStore 接口；后续可替换 sqlite-vec / Qdrant。
"""

from __future__ import annotations

import numpy as np

from socialmedia_agent.rag.vector_store import SearchHit, VectorStore


def _l2_normalize(vectors: list[list[float]]) -> np.ndarray:
    arr = np.asarray(vectors, dtype="float32")
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return arr / norms


class FaissVectorStore(VectorStore):
    def __init__(self, dim: int | None = None):
        import faiss

        self._faiss = faiss
        self._dim = dim
        self._ids: list[str] = []
        self._payloads: dict[str, dict] = {}
        self._seq = 0
        self._build_index()

    def _build_index(self) -> None:
        index = self._faiss.IndexFlatIP(self._dim or 0)
        self._index = index
        if self._dim:
            self._rebuild_vectors()

    def _rebuild_vectors(self) -> None:
        if not self._ids:
            return
        dim = self._dim
        vectors = [self._vectors_by_id[vid] for vid in self._ids]
        self._index = self._faiss.IndexFlatIP(dim)
        arr = _l2_normalize(vectors)
        self._index.add(arr)

    def add(
        self,
        vectors: list[list[float]],
        payloads: list[dict],
        ids: list[str] | None = None,
    ) -> None:
        if len(vectors) != len(payloads):
            raise ValueError("vectors 与 payloads 长度必须一致")
        if ids is None:
            ids = [f"hit-{self._seq + i}" for i in range(len(vectors))]
            self._seq += len(vectors)
        if len(ids) != len(vectors):
            raise ValueError("ids 长度必须与 vectors 一致")

        if self._dim is None:
            if not vectors:
                return
            self._dim = len(vectors[0])
            self._index = self._faiss.IndexFlatIP(self._dim)

        arr = _l2_normalize(vectors)
        self._index.add(arr)
        for vid, payload in zip(ids, payloads):
            self._ids.append(vid)
            self._payloads[vid] = payload
        # 保存原始向量供 delete 后重建
        if not hasattr(self, "_vectors_by_id"):
            self._vectors_by_id: dict[str, list[float]] = {}
        for vid, vector in zip(ids, vectors):
            self._vectors_by_id[vid] = vector

    def search(self, query_vector: list[float], top_k: int = 5) -> list[SearchHit]:
        if not self._ids or self._dim is None:
            return []
        q = _l2_normalize([query_vector])
        k = min(top_k, len(self._ids))
        scores, indices = self._index.search(q, k)
        hits = []
        for score, idx in zip(scores[0], indices[0]):
            vid = self._ids[int(idx)]
            hits.append(
                SearchHit(id=vid, score=float(score), payload=self._payloads.get(vid, {}))
            )
        return hits

    def delete(self, ids: list[str]) -> None:
        remaining: list[str] = []
        for vid in self._ids:
            if vid in ids:
                continue
            remaining.append(vid)
        removed = set(ids)
        for vid in removed:
            self._payloads.pop(vid, None)
            self._vectors_by_id.pop(vid, None)
        self._ids = remaining
        self._rebuild_vectors()

    def count(self) -> int:
        return len(self._ids)
