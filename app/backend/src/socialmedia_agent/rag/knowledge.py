"""运营知识库（RAG）种子与装载（P5.5.4）。

- KnowledgeDoc：单条知识（title/content）
- load_seed_docs：从 Markdown 种子文件解析（## 标题 + 正文块）
- seed_knowledge：embed + 写入 VectorStore
- build_embedder：按 Settings 构建嵌入器（OpenAI 兼容可选，默认 HashEmbedder）
- build_knowledge_retriever：装载持久化知识库（不存在则空库）

不引入 Qdrant/Milvus 等大型基础设施；VectorStore/Embedder 抽象保留，
生产可替换为语义嵌入模型（配置 SMA_EMBEDDING_MODEL + LLM_API_KEY）。
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from socialmedia_agent.config import Settings, get_settings
from socialmedia_agent.rag.embedder import Embedder, OpenAICompatEmbedder
from socialmedia_agent.rag.faiss_store import FaissVectorStore
from socialmedia_agent.rag.placeholder import HashEmbedder
from socialmedia_agent.rag.retriever import Retriever
from socialmedia_agent.rag.vector_store import VectorStore

logger = logging.getLogger(__name__)


@dataclass
class KnowledgeDoc:
    id: str
    title: str
    content: str


def _slug(text: str) -> str:
    s = re.sub(r"[^\w\u4e00-\u9fff]+", "-", text.strip().lower()).strip("-")
    return s or "doc"


def load_seed_docs(path: str | Path) -> list[KnowledgeDoc]:
    """解析 Markdown 种子文件：以 `## 标题` 分段，正文为后续非空行。"""
    text = Path(path).read_text(encoding="utf-8")
    docs: list[KnowledgeDoc] = []
    title: str | None = None
    lines: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            if title:
                docs.append(KnowledgeDoc(id=_slug(title), title=title, content="\n".join(lines).strip()))
            title = line[3:].strip()
            lines = []
        elif title is not None:
            lines.append(line)
    if title:
        docs.append(KnowledgeDoc(id=_slug(title), title=title, content="\n".join(lines).strip()))
    return [d for d in docs if d.content]


def seed_knowledge(store: VectorStore, embedder: Embedder, docs: list[KnowledgeDoc]) -> int:
    """将知识文档嵌入并写入向量库，返回写入条数。"""
    vectors = embedder.embed_texts([d.content for d in docs])
    store.add(
        vectors,
        [{"title": d.title, "content": d.content} for d in docs],
        ids=[d.id for d in docs],
    )
    logger.info("知识库写入 %s 条", len(docs))
    return len(docs)


def build_embedder(settings: Settings | None = None) -> Embedder:
    """按配置构建嵌入器；配置了嵌入模型且有密钥则用 OpenAI 兼容端点，否则 HashEmbedder。"""
    s = settings or get_settings()
    if s.embedding_model and s.llm_api_key:
        return OpenAICompatEmbedder(
            api_key=s.llm_api_key,
            base_url=s.llm_base_url,
            model=s.embedding_model,
            timeout=s.llm_timeout,
        )
    return HashEmbedder(dim=256)


def build_knowledge_retriever(settings: Settings | None = None) -> Retriever:
    """装载持久化知识库（文件不存在则返回空库），与种子使用同一嵌入器保证向量一致。"""
    s = settings or get_settings()
    embedder = build_embedder(s)
    store_path = Path(s.knowledge_store_path)
    store = FaissVectorStore.load(store_path) if store_path.exists() else FaissVectorStore()
    logger.info("知识库装载 count=%s path=%s", store.count(), store_path)
    return Retriever(embedder=embedder, store=store)
