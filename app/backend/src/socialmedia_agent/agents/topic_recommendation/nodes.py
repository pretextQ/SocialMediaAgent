"""Topic Recommendation 节点。

gather：经内部 Tool 收集 DB 事实（账号资料 / 已有内容 / 趋势话题 / 知识库）
analyze：LLM 结构化输出；失败或未配置 gateway 时规则兜底（确定性）；
        最终对 topics 硬去重（剔除与已有内容标题重复的选题），杜绝重复/编造
report：由结构化结果规则渲染人类可读 markdown
"""

from __future__ import annotations

from socialmedia_agent.agents.common import invoke_tool, llm_analyze, render_markdown
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.topic_recommendation.prompts import SYSTEM_PROMPT
from socialmedia_agent.agents.topic_recommendation.schemas import (
    RecommendedTopic,
    TopicRecommendationOutput,
)
from socialmedia_agent.llm.gateway import LLMGateway

MAX_TOPICS = 5


def gather(registry: ToolRegistry, account_id: str) -> dict:
    """收集选题推荐所需 DB 事实（只经 Tool）。"""
    profile = invoke_tool(registry, "get_account_profile", account_id=account_id) or {}
    recent = invoke_tool(registry, "get_recent_contents", account_id=account_id, limit=20)
    platform = profile.get("platform")
    trends = (
        invoke_tool(registry, "get_trend_data", platform=platform, period=7)
        if platform
        else []
    )
    knowledge = invoke_tool(registry, "search_operation_knowledge", query="选题方向", top_k=3)
    return {
        "account_id": account_id,
        "profile": profile,
        "recent_contents": recent,
        "trends": trends,
        "knowledge": knowledge,
    }


def analyze(gateway: LLMGateway | None, facts: dict) -> TopicRecommendationOutput:
    """LLM 结构化输出；失败或未配置 gateway 时规则兜底；最终硬去重。"""
    out = llm_analyze(
        gateway, SYSTEM_PROMPT, facts, TopicRecommendationOutput, fallback=_rule_fallback
    )
    out.topics = _finalize_topics(out.topics, _existing_titles(facts))
    return out


def _existing_titles(facts: dict) -> set[str]:
    return {
        (c.get("title") or "").strip().lower()
        for c in (facts.get("recent_contents") or [])
        if c.get("title")
    }


def _finalize_topics(
    topics: list[RecommendedTopic], existing_titles: set[str]
) -> list[RecommendedTopic]:
    """精确去重（剔除与已有内容标题重复、及内部重复），最多 MAX_TOPICS 条。"""
    seen = set(existing_titles)
    result: list[RecommendedTopic] = []
    for t in topics:
        key = (t.title or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(t)
        if len(result) >= MAX_TOPICS:
            break
    return result


def _rule_fallback(facts: dict) -> TopicRecommendationOutput:
    """确定性规则兜底：趋势话题（DB 事实）优先，其次知识库标题。"""
    account_id = facts.get("account_id", "")
    existing = _existing_titles(facts)
    topics: list[RecommendedTopic] = []

    for t in facts.get("trends") or []:
        kw = t.get("keyword", "")
        if not kw or kw.strip().lower() in existing:
            continue
        post_count = int(t.get("post_count", 0))
        topics.append(
            RecommendedTopic(
                title=kw,
                rationale=f"平台近7天热门话题（监测 {post_count} 条）",
                estimated_interest=min(100, 30 + min(70, post_count)),
            )
        )
        if len(topics) >= MAX_TOPICS:
            break

    if not topics:
        for hit in facts.get("knowledge") or []:
            title = (hit.get("payload") or {}).get("title", "")
            if not title or title.strip().lower() in existing:
                continue
            topics.append(
                RecommendedTopic(
                    title=title,
                    rationale="运营知识库推荐方向",
                    estimated_interest=60,
                )
            )
            if len(topics) >= MAX_TOPICS:
                break

    return TopicRecommendationOutput(account_id=account_id, topics=topics)


def render_report(recommendation: TopicRecommendationOutput, facts: dict) -> str:
    """由结构化结果渲染人类可读 markdown（确定性）。"""
    profile = facts.get("profile") or {}
    nickname = profile.get("nickname") or recommendation.account_id
    items = [
        f"{t.title}（兴趣度 {t.estimated_interest}/100）：{t.rationale}"
        for t in recommendation.topics
    ]
    return render_markdown(
        title=f"选题推荐报告：{nickname}",
        sections=[("推荐选题", items)],
    )
