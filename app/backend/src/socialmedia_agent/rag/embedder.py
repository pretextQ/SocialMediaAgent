"""Embedder 抽象接口与实现。

- Embedder：业务层唯一依赖的接口。
- OpenAICompatEmbedder：适配 OpenAI 兼容 embedding 端点（可选；P5.5.4）。
- HashEmbedder（placeholder.py）：确定性字符哈希向量，无外部依赖，默认/测试用。
业务层只依赖 Embedder 接口，可替换实现而不影响 RAG 流程。
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from openai import OpenAI


class Embedder(ABC):
    @abstractmethod
    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """批量文本 → 向量。"""

    def embed_query(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]


class OpenAICompatEmbedder(Embedder):
    """OpenAI 兼容 embedding 端点（BGE-M3 等，经统一端点）。"""

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        timeout: float = 60.0,
        http_client=None,
    ):
        self.model = model
        self._client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            http_client=http_client,
        )

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        resp = self._client.embeddings.create(model=self.model, input=texts)
        return [item.embedding for item in resp.data]
