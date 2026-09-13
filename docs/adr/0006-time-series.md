# ADR-0006: Metric / Topic 的时间序列语义

- 状态：已接受
- 日期：2026-09-13
- 相关阶段：P4 / P7（趋势分析与话题演变）
- 来源模块：无第三方移植。本决策为本项目内部的数据模型演进。

## 背景

- `docs/data-model.md` 与 `docs/status.md` G 组长期记着一条未决技术债：
  **「Metric『最新快照』语义 vs 时间序列未定（影响趋势/历史分析真实性）」**。
- 现状的幂等键决定了它是**快照**：
  - `Metric` 幂等键 `(content_id, account_id, metric_type, source)` —— **不含 `captured_at`**，重复采集覆盖旧值；
  - `Topic` 幂等键 `keyword` —— 「覆盖更新热度 / 时间窗口 / 摘要」，同样只有一行。
- 后果（已实测）：`POST /trends/analysis` 的「趋势分」实际是**按 `post_count` 的静态排序**，
  不是趋势判断；「某话题在上升还是消退」「某指标随时间如何变化」都无法回答。
- 这条债同时阻塞了 [`adr/README.md`](README.md) 第四节列为「待评估」的**话题演变时间线**候选。

## 决策

**新增只追加（append-only）的观测表，与现有快照表并存**：

| 表 | 语义 | 幂等键 |
|---|---|---|
| `metrics` / `topics`（不变） | **最新快照** | 现有键，一字不改 |
| `metric_observations`（新增） | **时间序列**，只追加 | 确定性 id：`sha256(content_id\|account_id\|metric_type\|source\|observed_at)[:32]` |
| `topic_observations`（新增） | **时间序列**，只追加 | 确定性 id：`sha256(keyword\|observed_at)[:32]` |

评估过的备选方案：

- **A 保持快照（不做）**：无法回答趋势与演变，且已有两端（`/trends/analysis`、话题演变候选）明确需要它。不采用。
- **B 改现有表**：把 `captured_at` 纳入 Metric 幂等键、把 Topic 改为 append-only。
  **不采用** —— 这两个表的「最新快照」语义被 HTTP API、MCP 工具、Agent Tool 与整套评测依赖，
  改它等于改核心契约，回归面过大且收益不增。
- **C 新增观测表（采纳）**：纯增量，现有查询 / 契约 / 测试**完全不变**。

关于 `observed_at` 的取值（**这一条是本次决策的关键细节**）：

- `RawToDomainMapper` 的 `captured_at = datetime.now(timezone.utc)`，即**采集动的 wall clock**；
- 因此观测表**默认每导入一次就追加一个观测点** —— 这是时间序列的正确语义
  （你确实在那一刻观测了一次），但意味着重复导入同一份 CSV 会产生多个点；
- 为支持可复现的重复导入，`import-csv` 增加 `--observed-at` 参数：
  显式指定批次观测时间后，同一批次重复导入 **收敛为同一条观测**（确定性 id 命中）。

## 理由

- 与 `AGENTS.md` 一致：不引入新基础设施（仍在同一个 SQLite / SQLAlchemy 内）；
  数据访问统一走 Repository；不手写散落 SQL。
- **幂等用确定性主键而不是 UniqueConstraint**：SQLite 下 NULL 在唯一约束中互不相等，
  而 `content_id` / `account_id` 可空，组合唯一键会漏掉 NULL 参与的去重。
  把业务键哈希成主键则不存在该问题，且天然幂等。
- 快照表继续承担「当前值查询」：Agent 的 `analyze_content_performance` 等取数路径零改动。

## 验证方式

- `tests/unit/test_observation_domain.py`：确定性 id（同键同 id）、锚定约束。
- `tests/unit/test_observation_repo.py`：重复 record 同一观测**不产生新行**；序列按时间升序；过滤生效。
- `tests/unit/test_import_csv.py` 扩展：导入后观测表有数据；带 `--observed-at` 重复导入不翻倍。
- `tests/unit/test_migrations.py`（既有守护）：模型与迁移不得漂移 —— 本次必须落一份迁移。

## 后果

正面：

- 解锁「话题演变」（上升 / 消退 / 新出现）与指标时间序列；
- 快照表零改动，既有 API / MCP / Tool / 评测不受影响；
- 为「`topics` 的 `platforms` JSON 无法下推 SQL」这一既有问题留出改进空间（观测表可按平台分列）。

负面 / 风险：

- **存储翻倍**：同一份数据在快照表与观测表各存一份。当前数据量（19 条 / 5 话题）下可忽略，
  但采集量大时需要保留策略（尚未实现 TTL / 归档）。
- **重复导入会产生多个观测点**（默认语义）；若要可复现，必须显式使用 `--observed-at`。
  这一点写进了 CLI 帮助与本文档，避免使用者误以为观测表也「幂等去重」。
- 观测表目前**只有写入方**，读取方（趋势演变）在后续任务落地；在此之前它只是「开始积累历史」。

## 参考代码

- 现状定义：`domain/metric.py`、`domain/topic.py`、`models/metric.py`、`models/topic.py`、
  `repositories/{metric_repo,topic_repo}.py`、`connectors/mapper.py:47`（`captured_at` 来源）。
- 本次新增：`domain/observation.py`、`models/observation.py`、`repositories/observation_repo.py`、
  `migrations/versions/*_add_observation_tables.py`、`cli/import_csv.py`（写入接线）。
- 决策依据：`docs/data-model.md` 第 7 节「已知语义问题」、`docs/status.md` G 组技术债、
  `docs/adr/README.md` 第四节（话题演变候选）。
