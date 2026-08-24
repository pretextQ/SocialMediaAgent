# P4 实施计划（Agent 扩展：5 个 Agent）

> 状态：已完成（2026-08-24，全量 `pytest` 217 passed，P4 DoD 三条打勾）
> 参考：`docs/architecture-analysis.md` 第六节 P4 计划、第七节 P4 DoD、`docs/adr/`、`docs/source-analysis.md`
> 样板：`app/backend/src/socialmedia_agent/agents/account_diagnosis/`（P3 已建，P4 复用其 gather/analyze/report 模式）

## P4 DoD（第七节）

- 每个 Agent 有固定输入/输出契约、prompts、节点图、单测+fixture e2e
- 全部通过回归套件
- 可组合调用

## 公共样板约定（对齐 P3）

每个 Agent 目录遵循 `account_diagnosis/` 结构：

| 文件 | 职责 |
|---|---|
| `schemas.py` | 输出 Pydantic 契约（固定字段，有回归测试） |
| `prompts.py` | system prompt；约束 LLM 只引用注入的 DB 事实、不编造业务数据 |
| `nodes.py` | gather（经内部 Tool 取数）→ analyze（LLM 结构化输出，`gateway=None` 时规则兜底）→ report（规则渲染 markdown） |
| `graph.py` | LangGraph 图（StateGraph） |
| API router | `POST /api/v1/...`，`gateway=None` 可无密钥演示 |

## 任务清单（每个任务完成后 commit+push）

| # | 任务 | 输入 → 输出契约 | 数据源（经 Tool） | 测试重点 |
|---|---|---|---|---|
| P4-0 | 公共基座：抽取 `agents/common.py`（gather/analyze/规则兜底/报告渲染可复用助手） | — | — | 现有 P3 测试不回归 |
| P4-1 | **Content Analysis**（内容分析） | `content_id` → `{ content_id, title, summary, quality_score, strengths[], weaknesses[], suggestions[] }` | `get_content_metrics` / `get_recent_contents` / `search_operation_knowledge` | 契约严格、LLM 失败兜底、统计注入可核验 |
| P4-2 | **Trend Analysis**（趋势分析） | `platform`+`period` → `{ platform, period, topics[], trend_score, insights[] }` | `get_trend_data`（当前占位）+ `get_content_metrics` 时间序列 | 空数据兜底、period 过滤 |
| P4-3 | **Topic Recommendation**（选题推荐） | `account_id` → `{ topics[{ title, rationale, estimated_interest }] }` | `search_operation_knowledge` / `get_recent_contents`（避免重复选题） | 与已有内容去重、RAG 召回 |
| P4-4 | **Title Optimization**（标题优化） | `content_id` 或原始标题 → `{ original, optimized_titles[3], explanation }` | `get_content_metrics` / `search_operation_knowledge`（标题写作知识） | 输出条数固定、结合历史表现 |
| P4-5 | **Strategy Advisor**（运营策略） | `account_id` → `{ strategy_summary, weekly_plan[], kpis[], risks[] }` | `get_historical_strategy` / `analyze_content_performance` / `get_recent_contents` / `get_trend_data`；结束时 `save_operation_memory` 沉淀 | 读-写 Memory 闭环、可组合 |
| P4-6 | 组合调用 + 回归：P2 最小图路由扩展接入 5 个新 Agent；全量回归 + 组合 e2e | — | — | 工具组合测试（DoD） |
| P4-DoD | 验收：第七节 P4 四条逐项打勾 + 三线表更新（Stats/趋势/选题涉及 MatrixFlow 参考，按需 ADR） | — | — | 全量测试绿 |

## 执行建议

1. 顺序：P4-0 → P4-1 → P4-2 → P4-3 → P4-4 → P4-5 → P4-6 → P4-DoD。
2. P4-1（Content Analysis）与 P3 数据依赖最相似，模式复用成本最低，优先做。
3. P4-2（Trend Analysis）依赖 `get_trend_data`（当前空实现），可能需要扩展该 Tool 或 Topic 数据层——改动前先报告。
4. 每个任务：写测试（TDD）→ 跑测试 → `git diff` → commit + push。

## 当前已知阻塞

- P1.11/1.12 真机端到端 + P3「用 P1 真实数据演示」仍待 crawler venv（`app/backend/.venv-crawler` 未装依赖）。
- P4 不依赖 crawler venv，可独立推进。
