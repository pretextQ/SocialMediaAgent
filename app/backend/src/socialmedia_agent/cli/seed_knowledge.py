"""CLI：seed-knowledge —— 将运营知识文档灌入向量库并持久化。

用法：
    python -m socialmedia_agent.cli.seed_knowledge --input seed/knowledge.md
    # 可选：--store 覆盖持久化路径、--embedding-model 指定嵌入模型
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from socialmedia_agent.config import get_settings
from socialmedia_agent.rag.faiss_store import FaissVectorStore
from socialmedia_agent.rag.knowledge import build_embedder, load_seed_docs, seed_knowledge


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="seed-knowledge", description="知识库种子入库并持久化")
    parser.add_argument("--input", required=True, help="知识种子 Markdown 文件路径")
    parser.add_argument("--store", default=None, help="向量库持久化路径（默认取 SMA_KNOWLEDGE_STORE）")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = get_settings()
    store_path = Path(args.store or settings.knowledge_store_path)

    docs = load_seed_docs(args.input)
    if not docs:
        print(f"[seed-knowledge] 未解析到任何知识文档: {args.input}", file=sys.stderr)
        return 1

    embedder = build_embedder(settings)
    store = FaissVectorStore.load(store_path) if store_path.exists() else FaissVectorStore()
    count = seed_knowledge(store, embedder, docs)
    store.save(store_path)
    print(
        f"[seed-knowledge] 写入 {count} 条知识 → {store_path} "
        f"(embedder={type(embedder).__name__})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
