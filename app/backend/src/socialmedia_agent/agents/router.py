"""指令路由（B1）：自然语言指令 → 「调用哪个 Tool / 哪个能力 + 参数」。

两条实现互为对照：

- **rules（确定性，默认）**：正则关键词 + 文本抽取；无外部依赖，测试完全可确定。
- **llm（agentic=True）**：把候选函数的 schema 交给模型做 function calling，
  由模型给出路由与参数。

安全边界：LLM 路径的任何异常、未返回**唯一**函数、函数名未知、参数过不了对应
pydantic schema，一律返回 None 交上层**回退 rules**——绝不执行半份决策。
state 的 `route_source`（llm / rules）让「这次谁做的路由」可观测（见 docs/issues.md #4）。
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from pydantic import BaseModel, Field

from socialmedia_agent.agents.tool_loop import export_tool_schemas
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import ProviderToolResult

logger = logging.getLogger(__name__)


@dataclass
class RouteDecision:
    """一次路由决策：目标（Tool 名，或 "agent:<能力名>"）+ 已校验参数。"""

    target: str
    args: dict = field(default_factory=dict)
    source: str = "rules"  # rules | llm


# ---------------------------------------------------------------------------
# 能力 pseudo-tool：参数字段少而固定，单独声明 schema 供 function calling 使用
# ---------------------------------------------------------------------------


class AccountRefArgs(BaseModel):
    account_id: str


class ContentRefArgs(BaseModel):
    content_id: str


class TrendArgs(BaseModel):
    platform: str
    period: int = Field(default=7, ge=1, le=90)


CAPABILITY_SCHEMAS: dict[str, type[BaseModel]] = {
    "content_analysis": ContentRefArgs,
    "trend_analysis": TrendArgs,
    "account_strategy": AccountRefArgs,
    "topic_recommendation": AccountRefArgs,
    "title_optimization": ContentRefArgs,
}

CAPABILITY_DESCRIPTIONS: dict[str, str] = {
    "content_analysis": "分析单条内容的质量（content_id，形如 bilibili:1001）",
    "trend_analysis": "分析某平台周期内的趋势话题（platform、period 天数）",
    "account_strategy": "账号健康诊断 + 运营策略（account_id，形如 bilibili:90001）",
    "topic_recommendation": "为账号推荐选题（account_id）",
    "title_optimization": "优化标题（content_id）",
}


# ---------------------------------------------------------------------------
# rules：确定性正则路由（对照组，同时是 LLM 失败时的回退路径）
# ---------------------------------------------------------------------------

# 规则路由：指令关键词 → Tool 名（P2 确定性解析）
_ROUTING_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"账号.*资料|资料.*账号|账号信息"), "get_account_profile"),
    (re.compile(r"最近.*内容|内容列表|列出.*内容"), "get_recent_contents"),
    (re.compile(r"内容.*指标|指标.*内容"), "get_content_metrics"),
    (re.compile(r"内容.*表现|表现分析|性能分析"), "analyze_content_performance"),
    (re.compile(r"知识库|运营知识|检索.*知识"), "search_operation_knowledge"),
    (re.compile(r"趋势"), "get_trend_data"),
    (re.compile(r"历史.*策略|策略"), "get_historical_strategy"),
    (re.compile(r"沉淀.*记忆|记录.*策略|保存.*记忆"), "save_operation_memory"),
]

# Agent / 能力级路由（优先于 Tool 路由）；命中返回 "agent:<name>"
_AGENT_ROUTING_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"内容分析|分析.*内容质量|内容质量分析"), "content_analysis"),
    (re.compile(r"趋势分析|平台.*趋势|趋势.*平台"), "trend_analysis"),
    (re.compile(r"账号诊断|账号.*健康|运营策略|策略制定|策略.*建议|制定.*策略"), "account_strategy"),
    (re.compile(r"选题推荐|推荐.*选题|选题.*推荐"), "topic_recommendation"),
    (re.compile(r"标题优化|优化.*标题"), "title_optimization"),
]

# 需要从指令里抽 id 的工具。analyze_content_performance / get_content_metrics 原先漏抽，
# 导致规则命中后 `tool.invoke()` 必然抛 ValidationError（路由存在但一用就崩）。
_ACCOUNT_ID_TOOLS = (
    "get_account_profile",
    "get_recent_contents",
    "get_historical_strategy",
    "analyze_content_performance",
)
_CONTENT_ID_TOOLS = ("get_content_metrics",)

_PLATFORM_RE = re.compile(
    r"(bilibili|douyin|xiaohongshu|kuaishou|weibo|zhihu|tieba|channels)"
)


def extract_account_id(text: str) -> str | None:
    """从指令中抽出形如 bilibili:90001 的 canonical_id。"""
    m = re.search(r"([a-z]+:[0-9a-zA-Z]+)", text)
    return m.group(1) if m else None


def extract_platform(text: str) -> str | None:
    m = _PLATFORM_RE.search(text)
    return m.group(1) if m else None


def _extract_limit(text: str) -> int:
    m = re.search(r"(\d+)\s*条", text)
    return int(m.group(1)) if m else 10


def args_for_tool(tool_name: str, text: str) -> dict:
    """从指令文本为 Tool 抽取参数（rules 路径使用）。"""
    if tool_name in _ACCOUNT_ID_TOOLS:
        account_id = extract_account_id(text)
        if not account_id:
            return {}
        args: dict = {"account_id": account_id}
        if tool_name == "get_recent_contents":
            args["limit"] = _extract_limit(text)
        return args
    if tool_name in _CONTENT_ID_TOOLS:
        content_id = extract_account_id(text)
        return {"content_id": content_id} if content_id else {}
    if tool_name == "search_operation_knowledge":
        m = re.search(r"知识库[：:]\s*(.+)$", text)
        return {"query": m.group(1).strip()} if m else {"query": text}
    if tool_name == "save_operation_memory":
        account_id = extract_account_id(text)
        if not account_id:
            return {}
        content = re.sub(r"沉淀一条运营记忆|保存.*记忆|记录.*策略[：:]", "", text).strip()
        content = content.replace(account_id, "").strip("：: ,，")
        return {"account_id": account_id, "category": "strategy", "content": content}
    return {}


def decide_route_rules(text: str) -> RouteDecision | None:
    """规则路由：能力优先于工具；未命中返回 None。"""
    for pattern, name in _AGENT_ROUTING_RULES:
        if pattern.search(text):
            return RouteDecision(target=f"agent:{name}", source="rules")
    for pattern, tool_name in _ROUTING_RULES:
        if pattern.search(text):
            return RouteDecision(
                target=tool_name, args=args_for_tool(tool_name, text), source="rules"
            )
    return None


# ---------------------------------------------------------------------------
# llm：function calling 路由
# ---------------------------------------------------------------------------

ROUTING_SYSTEM_PROMPT = """你是自媒体运营助手的路由模块。根据用户的自然语言指令，
从可用函数中选出**恰好一个**最匹配的执行，并给出参数。

规则：
1. 只调用一个函数，不要编造函数名。
2. 参数必须来自指令内容；指令里缺少必需参数（account_id / content_id）时不要臆造。
3. 无法匹配任何函数时，不要调用任何函数。
"""


def build_route_schemas(registry: ToolRegistry) -> list[dict]:
    """候选路由 = 全部内部 Tool + 能力 pseudo-tool（各自带参数 schema）。"""
    schemas = export_tool_schemas(registry.list())
    for name, model in CAPABILITY_SCHEMAS.items():
        schemas.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": CAPABILITY_DESCRIPTIONS[name],
                    "parameters": model.model_json_schema(),
                },
            }
        )
    return schemas


def _validate_arguments(name: str, arguments: dict, registry: ToolRegistry) -> dict | None:
    """参数必须过对应 schema；不合法返回 None（交上层回退），不执行半份决策。"""
    model = CAPABILITY_SCHEMAS.get(name)
    if model is None:
        try:
            model = registry.get(name).args_schema
        except KeyError:
            logger.warning("路由到未注册的函数 name=%s", name)
            return None
    try:
        return model(**arguments).model_dump()
    except Exception as exc:  # noqa: BLE001 - 校验失败即回退，不向上抛
        logger.warning("路由参数未通过 schema name=%s type=%s", name, type(exc).__name__)
        return None


def decide_route_llm(
    registry: ToolRegistry, gateway: LLMGateway, text: str
) -> RouteDecision | None:
    """让模型用 function calling 选择路由；任何异常/非法一律 None（回退 rules）。"""
    messages = [
        {"role": "system", "content": ROUTING_SYSTEM_PROMPT},
        {"role": "user", "content": text},
    ]
    result = gateway.call_with_tools(messages, build_route_schemas(registry))
    if not result.success or not isinstance(result.data, ProviderToolResult):
        logger.warning("LLM 路由失败，回退规则路径: %s", result.error)
        return None

    calls = result.data.tool_calls
    if len(calls) != 1:
        logger.info("LLM 未给出唯一路由（tool_calls=%s），回退规则路径", len(calls))
        return None

    call = calls[0]
    args = _validate_arguments(call.name, call.arguments, registry)
    if args is None:
        return None
    target = f"agent:{call.name}" if call.name in CAPABILITY_SCHEMAS else call.name
    return RouteDecision(target=target, args=args, source="llm")
