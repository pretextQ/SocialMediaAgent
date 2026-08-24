"""VectorStore 抽象接口（RAG 知识库）。

架构决策：必须设计 VectorStore 抽象接口，当前阶段不引入外部向量库服务。
P2 以 FAISS 实现；未来可替换为 sqlite-vec / Qdrant 而不影响业务层。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class SearchHit:
    id: str
    score: float
    payload: dict = field(default_factory=dict)


class VectorStore(ABC):
    @abstractmethod
    def add(self, vectors: list[list[float]], payloads: list[dict], ids: list[str] | None = None) -> None:
        """批量写入向量与负载；ids 缺省时由实现生成。"""

    @abstractmethod
    def search(self, query_vector: list[float], top_k: int = 5) -> list[SearchHit]:
        """按向量检索 top_k 命中，按相似度降序。"""

    @abstractmethod
    def delete(self, ids: list[str]) -> None:
        """按 id 删除向量。"""

    @abstractmethod
    def count(self) -> int:
        """当前向量数量。"""
