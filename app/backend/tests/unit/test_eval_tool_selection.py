"""工具选择评分测试（TDD，M3）。

口径：
- recall    = 命中的期望工具 / 期望工具数
- precision = 命中的期望工具 / 实际调用的【去重】工具数
- duplicate_calls = 实际调用次数 - 去重后数量
"""

import pytest

from socialmedia_agent.evaluation import score_tool_selection


def test_perfect_selection_scores_one():
    score = score_tool_selection(expected={"a", "b"}, actual=["a", "b"])

    assert score.recall == 1.0
    assert score.precision == 1.0
    assert score.f1 == 1.0
    assert score.exact_match is True
    assert score.duplicate_calls == 0
    assert score.missing == []
    assert score.unexpected == []


def test_missing_tool_lowers_recall_but_not_precision():
    score = score_tool_selection(expected={"a", "b", "c"}, actual=["a", "b"])

    assert score.recall == pytest.approx(2 / 3)
    assert score.precision == 1.0
    assert score.missing == ["c"]
    assert score.unexpected == []
    assert score.exact_match is False


def test_unexpected_tool_lowers_precision_but_not_recall():
    score = score_tool_selection(expected={"a"}, actual=["a", "z"])

    assert score.recall == 1.0
    assert score.precision == 0.5
    assert score.unexpected == ["z"]
    assert score.missing == []


def test_duplicate_calls_counted_but_do_not_change_set_metrics():
    score = score_tool_selection(expected={"a", "b"}, actual=["a", "a", "b", "b", "b"])

    assert score.recall == 1.0
    assert score.precision == 1.0
    assert score.duplicate_calls == 3
    assert score.exact_match is True


def test_f1_is_harmonic_mean():
    # recall=0.5, precision=1.0 -> f1 = 2*0.5*1/1.5 = 2/3
    score = score_tool_selection(expected={"a", "b"}, actual=["a"])

    assert score.recall == 0.5
    assert score.precision == 1.0
    assert score.f1 == pytest.approx(2 / 3)


def test_empty_expected_and_empty_actual_is_perfect():
    score = score_tool_selection(expected=set(), actual=[])

    assert score.recall == 1.0
    assert score.precision == 1.0
    assert score.f1 == 1.0
    assert score.exact_match is True


def test_expected_empty_but_actual_nonempty_flags_unexpected():
    score = score_tool_selection(expected=set(), actual=["a"])

    assert score.recall == 1.0
    assert score.precision == 0.0
    assert score.unexpected == ["a"]


def test_empty_actual_with_expected_scores_zero():
    score = score_tool_selection(expected={"a"}, actual=[])

    assert score.recall == 0.0
    assert score.precision == 0.0
    assert score.f1 == 0.0
    assert score.missing == ["a"]


def test_ordering_is_stable_for_reporting():
    score = score_tool_selection(expected={"c", "a", "b"}, actual=["b", "a", "a"])

    assert score.expected == ["a", "b", "c"]
    assert score.hit == ["a", "b"]
    assert score.missing == ["c"]
    assert score.actual == ["b", "a", "a"]
