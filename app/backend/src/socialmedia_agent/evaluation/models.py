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
    run_index: int = 0  # 第几轮（0-based）；runs=1 时恒为 0


@dataclass
class ModeSummary:
    """某个模式在所有用例上的汇总（多轮：先按轮聚合，再跨轮求均值与总体标准差）。

    单轮（runs=1）时 std_* 恒为 0.0 —— 报告必须同时给出 runs，
    否则「方差 0」会被误读成「结论稳定」。
    """

    mode: str
    case_count: int
    runs: int
    mean_recall: float
    std_recall: float
    mean_precision: float
    std_precision: float
    mean_f1: float
    std_f1: float
    mean_exact_match_rate: float
    std_exact_match_rate: float
    mean_duplicate_calls: float
    std_duplicate_calls: float
    total_duplicate_calls: int


@dataclass
class EvalReport:
    outcomes: list["CaseOutcome"] = field(default_factory=list)
    summaries: list["ModeSummary"] = field(default_factory=list)


@dataclass(frozen=True)
class RetrievalScore:
    """一次 RAG 检索的评分（@k 口径见 evaluation/retrieval.py）。"""

    expected: list[str]
    retrieved: list[str]
    hit_ids: list[str]
    recall_at_k: float
    precision_at_k: float
    reciprocal_rank: float
    hit: bool


@dataclass(frozen=True)
class RetrievalCase:
    """一条检索评测用例：查询 + 人工标注的相关文档 id。"""

    id: str
    query: str
    expected_ids: list[str]
    note: str = ""


@dataclass
class RetrievalOutcome:
    """单条用例的检索结果。"""

    case_id: str
    query: str
    score: "RetrievalScore"


@dataclass
class RetrievalSummary:
    """检索质量汇总。"""

    case_count: int
    k: int
    mean_recall_at_k: float
    mean_precision_at_k: float
    mrr: float
    hit_rate: float


@dataclass
class RetrievalReport:
    outcomes: list["RetrievalOutcome"] = field(default_factory=list)
    summary: "RetrievalSummary | None" = None


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
