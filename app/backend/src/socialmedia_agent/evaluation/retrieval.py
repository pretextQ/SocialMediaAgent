"""RAG 检索质量评分（P6）。

口径（钉死，避免各说各话）：

- recall@k    = 命中的期望文档 / 期望文档数（期望为空记为 1.0，与工具选择口径一致）
- precision@k = 命中的期望文档 / **实际返回条数**（返回不足 k 条时按实际条数算，不虚低）
- reciprocal_rank = 第一个命中文档的排名倒数；无命中为 0.0（期望为空记为 1.0）
- hit = 至少命中一个期望文档

为什么不用「命中数 / k」算 precision：检索器可能只返回 2 条，
按 k=5 当分母会把「返回得少但全对」误判成 precision 0.4。
"""

from __future__ import annotations

from .models import RetrievalScore


def score_retrieval(expected: list[str], retrieved: list[str], k: int) -> RetrievalScore:
    """按 @k 口径给一次检索打分。`retrieved` 必须按相关性排序（rank 1 在前）。"""
    top_k = list(retrieved[:k])
    expected_set = set(expected)
    hit_ids = [doc_id for doc_id in top_k if doc_id in expected_set]
    unique_hits = set(hit_ids)

    recall = len(unique_hits) / len(expected_set) if expected_set else 1.0
    if top_k:
        precision = len(unique_hits) / len(top_k)
    else:
        precision = 1.0 if not expected_set else 0.0

    reciprocal_rank = 1.0
    if expected_set:
        reciprocal_rank = 0.0
        for rank, doc_id in enumerate(top_k, start=1):
            if doc_id in expected_set:
                reciprocal_rank = 1.0 / rank
                break

    return RetrievalScore(
        expected=sorted(expected_set),
        retrieved=list(retrieved),
        hit_ids=hit_ids,
        recall_at_k=recall,
        precision_at_k=precision,
        reciprocal_rank=reciprocal_rank,
        hit=bool(hit_ids),
    )
