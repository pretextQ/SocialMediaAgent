"""Memory 摘要器：将账号的历史运营特征按 category 聚合为结构化摘要。

摘要结果供 Agent 启动时注入上下文（docs/architecture.md 5.3）。
规则版实现（确定性、可测试）；LLM 版摘要可在后续迭代替换。
"""

from __future__ import annotations

from collections import defaultdict

from socialmedia_agent.memory.models import MemoryCategory, MemoryEntry


class Summarizer:
    def summarize(self, entries: list[MemoryEntry]) -> dict[str, list[str]]:
        grouped: dict[str, list[str]] = defaultdict(list)
        for entry in entries:
            grouped[entry.category.value].append(entry.content)
        return dict(grouped)
