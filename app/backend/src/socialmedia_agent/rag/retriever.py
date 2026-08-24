"""Retriever：Embedder + VectorStore 组合，提供「文本查询 → 召回文档」的 RAG 检索入口。

写入侧由调用方（知识文档管理 / 种子脚本）负责：embed_texts → store.add。
日志只记录检索元数据，不记录查询内容（防敏感信息）。
"""

from __future__ import annotations

import logging

from socialmedia_agent.rag.embedder import Embedder
from socialmedia_agent.rag.vector_store import SearchHit, VectorStore

logger = logging.getLogger(__name__)


class Retriever:
    def __init__(self, embedder: Embedder, store: VectorStore):
        self.embedder = embedder
        self.store = store

    def retrieve(self, query: str, top_k: int = 5) -> list[SearchHit]:
        query_vector = self.embedder.embed_query(query)
        hits = self.store.search(query_vector, top_k=top_k)
        logger.debug("知识检索 top_k=%s hits=%s", top_k, len(hits))
        return hits
