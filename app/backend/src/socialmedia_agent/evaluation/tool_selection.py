"""工具选择评分（M3）。

口径（钉死，避免各说各话）：
- recall    = 命中的期望工具 / 期望工具数
- precision = 命中的期望工具 / 实际调用的【去重】工具数
- f1        = recall 与 precision 的调和平均
- exact_match = 去重后的实际集合 == 期望集合
- duplicate_calls = 实际调用次数 - 去重后数量

约定：期望为空时 recall 记为 1.0（没有东西要找）；precision 取决于实际是否有调用。
"""

from __future__ import annotations

from .models import ToolSelectionScore


def score_tool_selection(expected: set[str], actual: list[str]) -> ToolSelectionScore:
    """按集合口径给一次工具调用序列打分。"""
    actual_unique = set(actual)
    hit = sorted(expected & actual_unique)
    missing = sorted(expected - actual_unique)
    unexpected = sorted(actual_unique - expected)

    recall = len(hit) / len(expected) if expected else 1.0
    if actual_unique:
        precision = len(hit) / len(actual_unique)
    else:
        precision = 1.0 if not expected else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    return ToolSelectionScore(
        expected=sorted(expected),
        actual=list(actual),
        hit=hit,
        missing=missing,
        unexpected=unexpected,
        recall=recall,
        precision=precision,
        f1=f1,
        exact_match=actual_unique == expected,
        duplicate_calls=len(actual) - len(actual_unique),
    )
