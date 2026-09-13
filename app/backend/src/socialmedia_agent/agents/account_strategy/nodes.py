"""Account Strategy 节点（P5.5.1，合并 Diagnosis + Strategy）。

gather：经内部 Tool 收集 DB 事实（账号资料 / 表现 / 近期内容 / 历史策略(Memory读) / 趋势 / 选题候选）
analyze：LLM 结构化输出；失败或未配置 gateway 时规则兜底（确定性）
persist：将策略摘要写入 Memory（category=strategy，读-写闭环）
report：由结构化结果规则渲染人类可读 markdown
"""

from __future__ import annotations

import logging

from socialmedia_agent.agents.account_strategy.prompts import SYSTEM_PROMPT
from socialmedia_agent.agents.account_strategy.schemas import AccountStrategyOutput
from socialmedia_agent.agents.common import (
    AnalyzeSource,
    invoke_tool,
    llm_analyze_with_source,
    render_markdown,
)
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.topic_recommendation.nodes import (
    build_topic_candidates,
    gather_context,
    gather_topic_knowledge,
)
from socialmedia_agent.llm.gateway import LLMGateway

logger = logging.getLogger(__name__)


# 策略侧原本只看最近 5 条内容；共享上下文按 SHARED_RECENT_LIMIT 取数后在此切片，
# 保持注入 LLM 的 facts 语义不变（去重不应顺带改变事实的形状）
RECENT_CONTENTS_FOR_STRATEGY = 5


def gather(registry: ToolRegistry, account_id: str) -> dict:
    """收集账号诊断与策略所需 DB 事实（只经 Tool，含选题候选）。

    账号级事实（profile / recent / trends）通过 topic_recommendation.gather_context
    **取一次**后复用；早期版本直接调用其 gather()，会让同一批数据被请求两遍。
    """
    shared = gather_context(registry, account_id)
    perf = invoke_tool(registry, "analyze_content_performance", account_id=account_id)
    history = invoke_tool(registry, "get_historical_strategy", account_id=account_id)
    candidates = build_topic_candidates(
        {**shared, "knowledge": gather_topic_knowledge(registry)}
    )
    return {
        "account_id": account_id,
        "profile": shared["profile"],
        "performance": perf,
        "recent_contents": shared["recent_contents"][:RECENT_CONTENTS_FOR_STRATEGY],
        "history": history,
        "trends": shared["trends"],
        "topic_candidates": [c.model_dump() for c in candidates],
    }


def analyze_with_source(
    gateway: LLMGateway | None, facts: dict
) -> tuple[AccountStrategyOutput, AnalyzeSource]:
    """LLM 结构化输出 + 实际来源（llm / rules）。"""
    return llm_analyze_with_source(
        gateway, SYSTEM_PROMPT, facts, AccountStrategyOutput, fallback=_rule_fallback
    )


def analyze(gateway: LLMGateway | None, facts: dict) -> AccountStrategyOutput:
    """LLM 结构化输出；失败或未配置 gateway 时规则兜底（签名不变）。"""
    out, _source = analyze_with_source(gateway, facts)
    return out


def persist(registry: ToolRegistry, strategy: AccountStrategyOutput) -> dict:
    """将策略摘要写入 Memory（category=strategy），形成读-写闭环。"""
    result = invoke_tool(
        registry,
        "save_operation_memory",
        account_id=strategy.account_id,
        category="strategy",
        content=strategy.strategy_summary,
    )
    logger.info("策略已沉淀到 Memory account=%s", strategy.account_id)
    return result


def _rule_fallback(facts: dict) -> AccountStrategyOutput:
    """确定性规则兜底：健康度按平均播放量分档 + 策略分档 + 选题候选注入周计划。"""
    account_id = facts.get("account_id", "")
    perf = facts.get("performance") or {}
    content_count = int(perf.get("content_count", 0))
    total_views = float(perf.get("total_views", "0") or 0)
    avg_views = int(total_views / content_count) if content_count else 0

    # —— 诊断部分 ——
    strengths: list[str] = []
    weaknesses: list[str] = []
    recommendations: list[str] = []
    if content_count == 0:
        weaknesses.append("近期无内容产出")
        recommendations.append("恢复稳定更新节奏")
        health = 30
    elif avg_views < 100:
        weaknesses.append("平均播放量偏低")
        recommendations.append("优化标题与封面，提升点击率")
        health = 40
    elif avg_views < 1000:
        weaknesses.append("平均播放量中等，有提升空间")
        recommendations.append("强化内容差异化，稳定更新")
        health = 60
    else:
        strengths.append("更新稳定")
        health = 75

    # —— 策略部分 ——
    if content_count == 0:
        summary = "当前账号尚无内容产出，策略目标：建立稳定更新节奏"
        weekly_plan = ["第1周：完成内容定位并发布首条内容", "第2周起：保持每周 2 条更新"]
        kpis = ["首月发布不少于 8 条内容", "首月累计播放量达到 10000"]
        risks = ["内容更新不稳定", "缺乏粉丝基础"]
    elif avg_views < 100:
        summary = f"账号已发布 {content_count} 条内容，平均播放量偏低（{avg_views}），策略目标：提升单条质量与标题点击率"
        weekly_plan = ["每周 2 条：聚焦高互动选题", "每周复盘数据并优化标题"]
        kpis = ["月度平均播放量提升 30%", "每周更新不少于 2 条"]
        risks = ["平均播放量偏低", "互动率不足"]
    else:
        summary = f"账号已发布 {content_count} 条内容，平均播放量 {avg_views}，策略目标：稳定更新并扩大优势内容类型"
        weekly_plan = ["每周 3 条：延续高表现内容类型", "每月一次内容复盘"]
        kpis = ["月度播放量环比提升 20%", "互动率保持稳中有升"]
        risks = ["内容同质化风险", "依赖单平台流量"]

    candidates = facts.get("topic_candidates") or []
    if candidates:
        weekly_plan.insert(0, f"优先制作热门选题：{candidates[0]['title']}")

    return AccountStrategyOutput(
        account_id=account_id,
        account_health=health,
        strengths=strengths,
        weaknesses=weaknesses,
        anomalies=[],
        recommendations=recommendations,
        strategy_summary=summary,
        weekly_plan=weekly_plan,
        kpis=kpis,
        risks=risks,
    )


def render_report(strategy: AccountStrategyOutput, facts: dict) -> str:
    """由结构化结果渲染人类可读 markdown（确定性）。"""
    profile = facts.get("profile") or {}
    nickname = profile.get("nickname") or strategy.account_id
    sections = [
        ("优势", strategy.strengths),
        ("不足", strategy.weaknesses),
        ("异常", strategy.anomalies),
        ("建议", strategy.recommendations),
        ("周计划", strategy.weekly_plan),
        ("KPI", strategy.kpis),
        ("风险", strategy.risks),
    ]
    return render_markdown(
        title=f"账号运营报告：{nickname}",
        sections=sections,
        intro=[
            f"- 账号健康度：**{strategy.account_health}/100**",
            f"- 策略摘要：{strategy.strategy_summary}",
        ],
    )
