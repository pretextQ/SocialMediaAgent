# SocialMediaAgent API 接口清单

> 更新：2026-09-13
> 相关：架构见 [`architecture.md`](architecture.md)，数据模型见 [`data-model.md`](data-model.md)，项目进度见 [`status.md`](status.md)。
> 全部端点前缀 `/api/v1`；OpenAPI 文档见 `GET /openapi.json`，交互式 Swagger UI 见 `GET /docs`。
> 说明：Agent 端点在未配置 LLM API Key（`LLM_API_KEY` 未设置 → gateway=None）时走**确定性规则兜底**，可无密钥演示。

## 数据查询

| 方法 | 路径 | 说明 | 返回 |
|---|---|---|---|
| GET | `/accounts` | 账号列表（可按 `platform` 过滤；`limit` 默认 100 / 最大 500） | `Account[]` |
| GET | `/accounts/{account_id}` | 账号详情（canonical_id） | `Account` |
| GET | `/contents` | 内容列表（可按 `platform` 过滤） | `Content[]` |
| GET | `/contents/{content_id}` | 内容详情 | `Content` |
| GET | `/metrics` | 指标列表（可按 `content_id`/`metric_type` 过滤；`limit` 最大 1000） | `Metric[]` |

> 注：HTTP API 目前无数据写入端点；数据输入走 CLI（`import_csv` 手工导入 / `ingest` 自动采集 / `seed_knowledge` 知识库）或 Repository 程序化写入。

## 系统状态与周报

| 方法 | 路径 | 说明 | 返回 |
|---|---|---|---|
| GET | `/system/status` | 只读状态聚合：LLM 是否配置、知识库/Memory 规模、各表计数、库与周报目录 | `SystemStatus` |
| GET | `/reports` | 周报文件列表（扫描 `SMA_REPORT_DIR` 下 `*.md`，按修改时间倒序） | `{ reports: [{ name, size, modified_at }] }` |
| GET | `/reports/{name}` | 单篇周报正文（UTF-8 markdown） | `{ name, content }` |

`SystemStatus` 字段：`llm_configured` / `llm_model` / `llm_base_url` / `database_url` / `memory_database_url` /
`knowledge_store_path` / `knowledge_doc_count` / `memory_entry_count` / `account_count` / `content_count` /
`metric_count` / `topic_count` / `report_dir` / `report_count`。

> 安全性：`/reports/{name}` 只允许 `report_dir` 内的普通文件名，**拒绝目录穿越**（`..`、`/`、`\` 一律 404）；
> 周报目录不存在时列表返回空数组而非报错。周报由 `generate_all_weekly_reports` 写入；省略 `report_dir` 时回落到 `SMA_REPORT_DIR`，与读取端同源。

## Agent 能力

所有 Agent 端点返回体额外带 `source` 字段（见下节）。

| 方法 | 路径 | 输入 | 返回（response_model） | 说明 |
|---|---|---|---|---|
| POST | `/accounts/{account_id}/diagnosis` | — | `{ diagnosis: DiagnosisOutput, report, source }` | 账号健康诊断（P5.5.1 起为 Account Strategy 的兼容子集）|
| POST | `/contents/{content_id}/analysis` | — | `{ analysis: ContentAnalysisOutput, report, source }` | 单条内容质量分析（P4-1） |
| POST | `/trends/analysis` | `{ platform, period(默认7) }` | `{ analysis: TrendAnalysisOutput, report, source }` | 平台周期内趋势分析（P4-2） |
| POST | `/accounts/{account_id}/topic-recommendation` | — | `{ recommendation: TopicRecommendationOutput, report, source }` | 选题推荐（P5.5.1 起为内部能力直调）|
| POST | `/titles/optimize` | `{ content_id? , title? }`（至少其一） | `{ optimization: TitleOptimizationOutput, report, source }` | 标题优化，固定 3 条（P5.5.1 起为内部能力直调）|
| POST | `/accounts/{account_id}/strategy` | — | `{ strategy: AccountStrategyOutput, report, memory_saved, source }` | 账号运营诊断+策略（P5.5.1 合并），写 Memory 闭环 |

### 输出来源 `source`

`source` 取值 `"llm" | "rules"`，语义是**该次结果实际由谁产生**（而不是「配置了 LLM」）：

- `"llm"`：LLM 结构化输出通过 pydantic 校验；
- `"rules"`：gateway 未配置，或调用失败 / 输出未通过校验而回退确定性规则；
- 前端据此显示「LLM 生成 / 规则兜底」徽标（见 `app/frontend/src/components/SourceBadge.tsx`），**拿不到就显示「来源未知」，不默认成 LLM**。

> LLM 结构在 `agents/common.py`（`llm_analyze_with_source`）收敛；各 Agent 的 `analyze` 保留原签名并委托，避免破坏既有调用方。

## 错误语义

- `404`：`account_id` / `content_id` / 周报文件名不存在；`/reports/{name}` 的非法名（含目录穿越）同样返回 404，语义是「不存在」，不泄露「存在但被拒绝」。
- `422`：请求体校验失败（如 `/titles/optimize` 两者皆缺）。

## Agent 输出契约（均带回归测试）

- `AccountStrategyOutput`（/strategy 全量）: `{ account_id, account_health(0-100), strengths[], weaknesses[], anomalies[], recommendations[], strategy_summary, weekly_plan[], kpis[], risks[] }`
- `DiagnosisOutput`（/diagnosis 子集）: `{ account_health(0-100), strengths[], weaknesses[], anomalies[], recommendations[] }`
- `ContentAnalysisOutput`: `{ content_id, title?, summary, quality_score(0-100), strengths[], weaknesses[], suggestions[] }`
- `TrendAnalysisOutput`: `{ platform, period, topics[{keyword,title?,post_count, direction?, change_pct?, observation_count?}], trend_score(0-100), insights[] }`（topics 以 DB 事实为准）
  - `direction` ∈ `rising | fading | stable | new | null`，由**只追加的观测表**算出（见 [ADR-0006](adr/0006-time-series.md)）；
    `null` 表示**尚无观测、方向未知**，与 `stable`（测过但没变）是两件事，前端不得把 `null` 当持平。
- `TopicRecommendationOutput`: `{ account_id, topics[{title, rationale, estimated_interest(0-100)}] }`（与已有内容去重）
- `TitleOptimizationOutput`: `{ original, optimized_titles[固定3条], explanation }`

## LLM / 知识库接线（P5.5.3 / P5.5.4）

- 生产入口 `app = create_app(gateway=build_gateway(), retriever=build_knowledge_retriever())`（见 `api/main.py`）。
- `LLM_API_KEY`（`.env`）有效时注入 `LLMGateway`（OpenAI 兼容端点），Agent `analyze` 走 LLM 结构化输出，失败仍回退规则兜底；无 Key 则全部规则兜底。
- 知识库经 `seed-knowledge` CLI 灌入后由 `retriever` 注入，Agent 的 `search_operation_knowledge` 可查询（未注入则为空库）。

## 前端

前端（`app/frontend/`）消费上述全部端点；`/system/status` 与 `/reports` 是前端「系统状态」「运营周报」两页的依赖。
启动方式见 [`../README.md`](../README.md) 的「前端」一节。
