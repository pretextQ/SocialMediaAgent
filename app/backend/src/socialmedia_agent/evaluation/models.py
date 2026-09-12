"""评测数据结构（M3）。

评测的目标不是「输出看起来好不好」，而是可复核的数字：
- 工具选择质量（recall / precision / f1 / exact_match / 重复调用）
- 规则路径与 LLM 路径的同批对照
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class EvalCase:
    """一个评测用例：账号 + 人工标注的期望工具集。"""

    id: str
    account_id: str
    expected_tools: list[str]
    note: str = ""


@dataclass
class CaseOutcome:
    """单个用例在某个模式下的执行结果。"""

    case_id: str
    mode: str  # rules | llm
    source: str  # 实际使用的 gather_source
    tool_trace: list[str]
    score: "ToolSelectionScore"


@dataclass
class ModeSummary:
    """某个模式在所有用例上的汇总。"""

    mode: str
    case_count: int
    mean_recall: float
    mean_precision: float
    mean_f1: float
    exact_match_rate: float
    total_duplicate_calls: int


@dataclass
class EvalReport:
    outcomes: list["CaseOutcome"] = field(default_factory=list)
    summaries: list["ModeSummary"] = field(default_factory=list)


@dataclass
class ToolSelectionScore:
    """一次运行的工具选择评分（集合口径 + 重复调用计数）。"""

    expected: list[str]
    actual: list[str]
    hit: list[str]
    missing: list[str]
    unexpected: list[str]
    recall: float
    precision: float
    f1: float
    exact_match: bool
    duplicate_calls: int
