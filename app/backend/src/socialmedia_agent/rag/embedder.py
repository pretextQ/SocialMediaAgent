"""Embedder 抽象接口。

P2 将提供远端 OpenAI 兼容 embedding 与本地 sentence-transformers 两种实现；
业务层只依赖本接口。
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class Embedder(ABC):
    @abstractmethod
    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """批量文本 → 向量。"""

    def embed_query(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]
