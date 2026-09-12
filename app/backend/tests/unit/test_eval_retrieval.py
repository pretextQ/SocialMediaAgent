"""RAG 检索质量评分测试（TDD，P6）。

口径（钉死）：

- `recall@k`    = 命中的期望文档 / 期望文档数（期望为空记为 1.0，与工具选择口径一致）
- `precision@k` = 命中的期望文档 / 实际返回条数（返回不足 k 条时按实际条数算，不虚低）
- `reciprocal_rank` = 第一个命中文档的排名倒数；无命中为 0.0（期望为空记为 1.0）
- `hit` = 至少命中一个
"""

import pytest

from socialmedia_agent.evaluation import score_retrieval


def test_perfect_retrieval():
    score = score_retrieval(expected=["a"], retrieved=["a", "b", "c"], k=3)

    assert score.recall_at_k == 1.0
    assert score.precision_at_k == pytest.approx(1 / 3)
    assert score.reciprocal_rank == 1.0
    assert score.hit is True
    assert score.hit_ids == ["a"]


def test_recall_only_counts_expected_inside_top_k():
    score = score_retrieval(expected=["a", "d"], retrieved=["a", "b", "c"], k=3)

    assert score.recall_at_k == 0.5
    assert score.hit is True


def test_total_miss_scores_zero():
    score = score_retrieval(expected=["z"], retrieved=["a", "b"], k=2)

    assert score.recall_at_k == 0.0
    assert score.precision_at_k == 0.0
    assert score.reciprocal_rank == 0.0
    assert score.hit is False


def test_reciprocal_rank_uses_first_relevant_position():
    score = score_retrieval(expected=["c"], retrieved=["a", "b", "c"], k=3)

    assert score.reciprocal_rank == pytest.approx(1 / 3)


def test_rank_one_relevant_beats_rank_three():
    first = score_retrieval(expected=["a"], retrieved=["a", "b", "c"], k=3)
    third = score_retrieval(expected=["c"], retrieved=["a", "b", "c"], k=3)

    assert first.reciprocal_rank > third.reciprocal_rank


def test_empty_expected_is_perfect():
    score = score_retrieval(expected=[], retrieved=["a"], k=1)

    assert score.recall_at_k == 1.0
    assert score.reciprocal_rank == 1.0


def test_precision_uses_returned_count_when_fewer_than_k():
    """只返回 1 条且命中时 precision 应为 1.0，而不是 1/5。"""
    score = score_retrieval(expected=["a"], retrieved=["a"], k=5)

    assert score.precision_at_k == 1.0


def test_empty_retrieval_with_expected_scores_zero():
    score = score_retrieval(expected=["a"], retrieved=[], k=3)

    assert score.recall_at_k == 0.0
    assert score.precision_at_k == 0.0
    assert score.reciprocal_rank == 0.0
