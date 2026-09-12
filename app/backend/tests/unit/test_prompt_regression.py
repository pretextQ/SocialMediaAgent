"""Prompt 回归测试（P6）。

**为什么需要**：prompt 是行为的一部分，但改起来没有任何反馈——改错一个词，只有线上输出变差，
没有测试会红。这里把「各 Agent 实际发给模型的完整消息（system + 序列化后的 facts）」固化成
golden 快照：**改了模板或 facts 序列化方式，测试立刻红**，逼迫作者显式确认这是有意的改动。

更新快照（确认改动无误后）：

```powershell
$env:UPDATE_GOLDEN = "1"
.venv/Scripts/python.exe -m pytest tests/unit/test_prompt_regression.py
```

（更新后请 `git diff` 检查快照差异是否符合预期，再连同代码一起提交。）
"""

import os
from pathlib import Path

import pytest

from socialmedia_agent.agents.account_strategy import agentic as account_strategy_agentic
from socialmedia_agent.agents.account_strategy.prompts import SYSTEM_PROMPT as ACCOUNT_STRATEGY
from socialmedia_agent.agents.common import build_facts_prompt
from socialmedia_agent.agents.content_analysis.prompts import SYSTEM_PROMPT as CONTENT_ANALYSIS
from socialmedia_agent.agents.router import ROUTING_SYSTEM_PROMPT
from socialmedia_agent.agents.title_optimization.prompts import SYSTEM_PROMPT as TITLE_OPTIMIZATION
from socialmedia_agent.agents.topic_recommendation.prompts import (
    SYSTEM_PROMPT as TOPIC_RECOMMENDATION,
)
from socialmedia_agent.agents.trend_analysis.prompts import SYSTEM_PROMPT as TREND_ANALYSIS

GOLDEN_DIR = Path(__file__).resolve().parents[1] / "golden" / "prompts"

# 固定 facts 夹具：不含时间/随机，保证快照可比较
FACTS = {
    "account_id": "bilibili:90001",
    "profile": {
        "canonical_id": "bilibili:90001",
        "platform": "bilibili",
        "nickname": "示例账号",
    },
    "performance": {"content_count": 2, "total_views": "1500"},
    "recent_contents": [{"canonical_id": "bilibili:1001", "title": "示例标题"}],
    "trends": [{"keyword": "效率工具测评", "post_count": 88}],
    "knowledge": [{"id": "k1", "score": 0.9, "payload": {"title": "标题写作方法"}}],
}

ROUTE_QUERY = "获取账号 bilibili:90001 的资料"


def _join(system: str, user: str) -> str:
    return f"--- system ---\n{system}\n--- user ---\n{user}\n"


def _facts_prompt() -> str:
    return build_facts_prompt(FACTS)


PROMPTS = {
    "account_strategy": lambda: _join(ACCOUNT_STRATEGY, _facts_prompt()),
    "content_analysis": lambda: _join(CONTENT_ANALYSIS, _facts_prompt()),
    "trend_analysis": lambda: _join(TREND_ANALYSIS, _facts_prompt()),
    "topic_recommendation": lambda: _join(TOPIC_RECOMMENDATION, _facts_prompt()),
    "title_optimization": lambda: _join(TITLE_OPTIMIZATION, _facts_prompt()),
    "account_strategy_agentic_gather": lambda: _join(
        account_strategy_agentic.SYSTEM_PROMPT,
        account_strategy_agentic._build_user_prompt("bilibili:90001"),
    ),
    "router": lambda: _join(ROUTING_SYSTEM_PROMPT, ROUTE_QUERY),
}


@pytest.mark.parametrize("name", sorted(PROMPTS))
def test_prompt_snapshot_matches_golden(name):
    current = PROMPTS[name]()
    golden = GOLDEN_DIR / f"{name}.txt"

    if os.environ.get("UPDATE_GOLDEN") == "1":
        golden.parent.mkdir(parents=True, exist_ok=True)
        golden.write_text(current, encoding="utf-8")
        pytest.skip(f"已更新 golden: {golden.name}")

    assert golden.exists(), (
        f"缺少 golden 快照 {golden}。首次建立请跑："
        "$env:UPDATE_GOLDEN=1; pytest tests/unit/test_prompt_regression.py"
    )
    assert current == golden.read_text(encoding="utf-8"), (
        f"prompt 与 golden 不一致（{name}）。若确认是有意改动，请更新快照并 review diff："
        "$env:UPDATE_GOLDEN=1; pytest tests/unit/test_prompt_regression.py"
    )
