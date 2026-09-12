"""生成合成演示数据（SYNTHETIC）—— 仅用于开发 / 演示 / 链路验证。

！！重要！！
  本脚本产出的是**编造的数据**。必须遵守：
    1. 用 --source synthetic 导入，使其在 Metric.source 中可被识别；
    2. 导入独立 demo 库（如 data/sma_demo.db），不得混入真实数据库；
    3. 绝不作为真实业务数据，也绝不作为评测依据。

设计意图：让 Agent "有东西可分析"，而不是随机噪声 ——
  - 账号 A：稳定增长 + 一次爆款（异常检测有信号）
  - 账号 B：持续下滑（策略应有反应）
  - 发布日期相对运行当天生成，因此不会随日期推移失效
  - 固定随机种子，结果可复现

用法：
    python seed/generate_demo_data.py --output seed/demo_synthetic.csv
"""

from __future__ import annotations

import argparse
import csv
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

HEADER = [
    "platform", "account_platform_id", "account_nickname", "content_platform_id",
    "title", "content", "content_type", "publish_time", "url",
    "views", "likes", "comments", "shares", "favorites",
]

# 话题（Topic）CSV —— 趋势分析与选题推荐需要它。
# 此前生成器不产出 Topic，导致 demo 库 topics 为空、/trends/analysis 永远返回空结果。
TOPIC_HEADER = ["keyword", "platforms", "post_count", "title", "summary", "last_seen"]

TOPICS = [
    ("效率工具测评", "bili", 88, "近 7 天效率工具类话题热度"),
    ("RAG 检索增强", "bili", 120, "检索增强生成相关讨论持续走高"),
    ("Agent 工作流", "bili", 65, "智能体编排与工具调用"),
    ("大模型评测", "bili|zhihu", 47, "模型能力对比与评测方法"),
    ("自动化办公", "bili", 39, "办公自动化与脚本化实践"),
]


def build_topic_rows(now: datetime) -> list[list[str]]:
    """话题行：last_seen 取运行当天，保证落在趋势查询的时间窗口内。"""
    stamp = now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return [
        [keyword, platforms, str(post_count), keyword, summary, stamp]
        for keyword, platforms, post_count, summary in TOPICS
    ]

ACCOUNTS = [
    {
        "platform": "bili",
        "mid": "70000001",
        "nickname": "AI 科普站",
        "count": 30,
        "start_views": 6000,
        "step": 1.06,          # 每条比上一条高 6%：稳定增长
        "spike_at": 21,        # 第 22 条是爆款
        "spike_x": 28,
        "type": "video",
        "desc": "本视频用通俗例子讲解一个 AI 概念，并给出可上手的实践建议。",
        "titles": [
            "用大白话讲清楚 Transformer",
            "RAG 到底解决了什么问题",
            "为什么你的 Prompt 总是不稳定",
            "从零搭一个最小的 Agent",
            "向量检索入门：从原理到落地",
            "Function Calling 踩坑记录",
            "LangGraph 状态机是怎么跑的",
            "本地跑大模型值不值",
            "Embedding 选型对比",
            "评测一个 LLM 应用该看什么指标",
        ],
    },
    {
        "platform": "bili",
        "mid": "70000002",
        "nickname": "效率工具研究所",
        "count": 20,
        "start_views": 42000,
        "step": 0.86,          # 每条比上一条低 14%：明显下滑
        "spike_at": -1,
        "spike_x": 1,
        "type": "video",
        "desc": "本期介绍一款效率工具的使用技巧与适用场景。",
        "titles": [
            "这 5 个快捷键让我每天省 1 小时",
            "笔记软件的三种用法对比",
            "自动化你的周报：一次配置长期受益",
            "文件管理我踩过的坑",
            "团队协作工具怎么选",
        ],
    },
]


def build_rows(account: dict, rng: random.Random, now: datetime) -> list[list[str]]:
    rows: list[list[str]] = []
    count = account["count"]
    for i in range(count):
        publish = now - timedelta(days=(count - 1 - i) * 2, hours=rng.randint(0, 20))
        base = account["start_views"] * (account["step"] ** i)
        if i == account["spike_at"]:
            base *= account["spike_x"]
        views = int(base * rng.uniform(0.78, 1.28))
        likes = int(views * rng.uniform(0.035, 0.075))
        comments = max(0, int(views * rng.uniform(0.002, 0.009)))
        favorites = int(likes * rng.uniform(0.3, 0.9))
        shares = int(likes * rng.uniform(0.04, 0.18))
        bvid = f"BV{account['mid']}{i:04d}"
        title = f"{account['titles'][i % len(account['titles'])]}（第{i + 1}期）"
        rows.append([
            account["platform"],
            account["mid"],
            account["nickname"],
            bvid,
            title,
            account["desc"],
            account["type"],
            publish.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            f"https://www.bilibili.com/video/{bvid}",
            str(views), str(likes), str(comments), str(shares), str(favorites),
        ])
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="生成合成演示数据（SYNTHETIC）")
    parser.add_argument("--output", default="seed/demo_synthetic.csv", help="输出内容 CSV 路径")
    parser.add_argument(
        "--topics-output",
        default="seed/demo_synthetic_topics.csv",
        help="输出话题 CSV 路径（供 import_csv --topics 使用）",
    )
    parser.add_argument("--seed", type=int, default=20260912, help="随机种子（保证可复现）")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    now = datetime.now(timezone.utc)

    all_rows: list[list[str]] = []
    for account in ACCOUNTS:
        all_rows.extend(build_rows(account, rng, now))

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADER)
        writer.writerows(all_rows)

    topics_out = Path(args.topics_output)
    topics_out.parent.mkdir(parents=True, exist_ok=True)
    topic_rows = build_topic_rows(now)
    with topics_out.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(TOPIC_HEADER)
        writer.writerows(topic_rows)

    print(f"[generate-demo] 已生成 {len(all_rows)} 行 -> {out}")
    print(f"[generate-demo] 已生成 {len(topic_rows)} 条话题 -> {topics_out}")
    print("[generate-demo] 这是 SYNTHETIC 数据，导入时必须用 --source synthetic")
    by_account: dict[str, list[list[str]]] = {}
    for row in all_rows:
        by_account.setdefault(row[1], []).append(row)
    for mid, rows in by_account.items():
        views = [int(r[9]) for r in rows]
        print(f"  mid={mid} nickname={rows[0][2]} 条数={len(rows)} "
              f"播放 min={min(views)} max={max(views)} 合计={sum(views)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
