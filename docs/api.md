# SocialMediaAgent API 接口清单

> 生成：2026-08-24（P5-1）
> 全部端点前缀 `/api/v1`；OpenAPI 文档见 `GET /openapi.json`，交互式 Swagger UI 见 `GET /docs`。
> 说明：所有 Agent 端点在未配置 LLM Gateway（gateway=None）时走**确定性规则兜底**，可无密钥演示。

## 数据查询

| 方法 | 路径 | 说明 | 返回 |
|---|---|---|---|
| GET | `/accounts` | 账号列表（可按 `platform` 过滤） | `Account[]` |
| GET | `/accounts/{account_id}` | 账号详情（canonical_id） | `Account` |
| GET | `/contents` | 内容列表（可按 `platform` 过滤） | `Content[]` |
| GET | `/contents/{content_id}` | 内容详情 | `Content` |
| GET | `/metrics` | 指标列表（可按 `content_id`/`metric_type` 过滤） | `Metric[]` |

## Agent 能力

| 方法 | 路径 | 输入 | 返回（response_model） | 说明 |
|---|---|---|---|---|
| POST | `/accounts/{account_id}/diagnosis` | — | `DiagnosisResponse{ diagnosis: DiagnosisOutput, report }` | 账号健康诊断（P3） |
| POST | `/contents/{content_id}/analysis` | — | `ContentAnalysisResponse{ analysis: ContentAnalysisOutput, report }` | 单条内容质量分析（P4-1） |
| POST | `/trends/analysis` | `{ platform, period(默认7) }` | `TrendAnalysisResponse{ analysis: TrendAnalysisOutput, report }` | 平台周期内趋势分析（P4-2） |
| POST | `/accounts/{account_id}/topic-recommendation` | — | `TopicRecommendationResponse{ recommendation: TopicRecommendationOutput, report }` | 选题推荐（P4-3） |
| POST | `/titles/optimize` | `{ content_id? , title? }`（至少其一） | `TitleOptimizationResponse{ optimization: TitleOptimizationOutput, report }` | 标题优化，固定 3 条（P4-4） |
| POST | `/accounts/{account_id}/strategy` | — | `StrategyAdvisorResponse{ strategy: StrategyAdvisorOutput, report, memory_saved }` | 运营策略，写 Memory 闭环（P4-5） |

## 错误语义

- `404`：`account_id` / `content_id` 不存在
- `422`：请求体校验失败（如 `/titles/optimize` 两者皆缺）

## Agent 输出契约（均带回归测试）

- `DiagnosisOutput`: `{ account_health(0-100), strengths[], weaknesses[], anomalies[], recommendations[] }`
- `ContentAnalysisOutput`: `{ content_id, title?, summary, quality_score(0-100), strengths[], weaknesses[], suggestions[] }`
- `TrendAnalysisOutput`: `{ platform, period, topics[{keyword,title?,post_count}], trend_score(0-100), insights[] }`（topics 以 DB 事实为准）
- `TopicRecommendationOutput`: `{ account_id, topics[{title, rationale, estimated_interest(0-100)}] }`（与已有内容去重）
- `TitleOptimizationOutput`: `{ original, optimized_titles[固定3条], explanation }`
- `StrategyAdvisorOutput`: `{ account_id, strategy_summary, weekly_plan[], kpis[], risks[] }`

## LLM 接入

Agent 端点当前以 `gateway=None` 运行（规则兜底）。注入 `LLMGateway`（OpenAI 兼容端点，见 `docs/adr/0002-llm-gateway.md`）后，`analyze` 节点切换为 LLM 结构化输出，失败时仍回退规则兜底。
