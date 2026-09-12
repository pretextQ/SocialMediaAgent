"""Account Strategy 的「LLM 自主工具决策」版 gather（M2）。

与确定性 gather 的区别：
- 确定性 gather：固定调用 profile / performance / recent / history / trends 五个工具
- agentic gather：把工具 schema 交给模型，**由模型决定调哪些、调几次**

设计约束：
- 失败（gateway 报错 / 超步数）必须**回退确定性 gather**，绝不产出半份事实；
- 返回 source 标注本次事实来自 "llm" 还是 "rules"，供上层与 M3 评测区分；
- 工具调用轨迹必须完整保留（M3 用它计算工具选择正确率）。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from socialmedia_agent.agents.account_strategy.nodes import gather as deterministic_gather
from socialmedia_agent.agents.tool_loop import ToolCallRecord, run_tool_loop
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.topic_recommendation.nodes import build_topic_candidates
from socialmedia_agent.llm.gateway import LLMGateway

logger = logging.getLogger(__name__)

# 允许模型选择的工具（与确定性 gather 覆盖的能力一致）
ALLOWED_TOOLS = [
    "get_account_profile",
    "analyze_content_performance",
    "get_recent_contents",
    "get_historical_strategy",
    "get_trend_data",
    "search_operation_knowledge",
]

# 工具名 -> facts 语义键（保持与确定性 gather 相同的 facts 形状）
TOOL_TO_FACT_KEY = {
    "get_account_profile": "profile",
    "analyze_content_performance": "performance",
    "get_recent_contents": "recent_contents",
    "get_historical_strategy": "history",
    "get_trend_data": "trends",
    "search_operation_knowledge": "knowledge",
}

SYSTEM_PROMPT = """你是自媒体账号运营分析师。你的任务是**自行判断需要哪些数据**，
调用可用工具把事实收集齐，然后给出简短的结论。

规则：
1. 工具返回的都是数据库真实事实，不得臆造数据。
2. 按需调用，不要为了凑数重复调用同一个工具。
3. 收集到足够信息后，用一句话说明你的判断依据即可，不要输出 JSON。
"""


@dataclass
class AgenticGather:
    """一次 agentic gather 的结果。"""

    facts: dict
    tool_trace: list[str] = field(default_factory=list)
    source: str = "llm"  # llm | rules


def _build_user_prompt(account_id: str) -> str:
    return (
        f"请分析账号 {account_id} 的运营情况。"
        "你可以调用工具获取：账号资料、内容表现聚合、近期内容、历史运营策略、平台趋势、运营知识。"
        "请自行判断需要哪些数据，收集完成后用一句话给出你的判断依据。"
    )


def _assemble_facts(account_id: str, records: list[ToolCallRecord]) -> dict:
    """把工具调用结果映射为与确定性 gather 相同的语义键，缺失的键就是不存在的。"""
    facts: dict = {"account_id": account_id}
    for record in records:
        if not record.ok:
            continue
        key = TOOL_TO_FACT_KEY.get(record.name)
        if key is not None:
            facts[key] = record.result

    # 与确定性 gather 对齐：有趋势数据时派生选题候选
    if facts.get("trends"):
        facts["topic_candidates"] = [
            candidate.model_dump()
            for candidate in build_topic_candidates({
                "trends": facts["trends"],
                "recent_contents": facts.get("recent_contents") or [],
                "knowledge": facts.get("knowledge") or [],
            })
        ]
    return facts


def _fallback(registry: ToolRegistry, account_id: str, reason: str) -> AgenticGather:
    logger.warning("agentic gather 回退确定性路径: %s", reason)
    return AgenticGather(
        facts=deterministic_gather(registry, account_id),
        tool_trace=[],
        source="rules",
    )


def gather_agentic(
    registry: ToolRegistry,
    gateway: LLMGateway | None,
    account_id: str,
    *,
    max_steps: int = 6,
) -> AgenticGather:
    """让模型自主选择工具收集账号事实；失败则回退确定性 gather。"""
    if gateway is None:
        return _fallback(registry, account_id, "gateway 未配置")

    loop = run_tool_loop(
        registry,
        gateway,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(account_id),
        allowed_tools=ALLOWED_TOOLS,
        max_steps=max_steps,
    )

    if not loop.ok:
        return _fallback(registry, account_id, loop.error or "tool loop 失败")

    return AgenticGather(
        facts=_assemble_facts(account_id, loop.tool_calls),
        tool_trace=[record.name for record in loop.tool_calls],
        source="llm",
    )
