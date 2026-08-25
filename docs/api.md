# SocialMediaAgent API 接口清单

> 更新：2026-08-25（P5.5 收敛后）
> 全部端点前缀 `/api/v1`；OpenAPI 文档见 `GET /openapi.json`，交互式 Swagger UI 见 `GET /docs`。
> 说明：Agent 端点在未配置 LLM API Key（`LLM_API_KEY` 未设置 → gateway=None）时走**确定性规则兜底**，可无密钥演示。

## 数据查询

| 方法 | 路径 | 说明 | 返回 |
|---|---|---|---|
| GET | `/accounts` | 账号列表（可按 `platform` 过滤） | `Account[]` |
| GET | `/accounts/{account_id}` | 账号详情（canonical_id） | `Account` |
| GET | `/contents` | 内容列表（可按 `platform` 过滤） | `Content[]` |
| GET | `/contents/{content_id}` | 内容详情 | `Content` |
| GET | `/metrics` | 指标列表（可按 `content_id`/`metric_type` 过滤） | `Metric[]` |

> 注：HTTP API 目前无数据写入端点；数据输入走 CLI（`ingest` / `seed-knowledge`）或 Repository 程序化写入。

## Agent 能力

| 方法 | 路径 | 输入 | 返回（response_model） | 说明 |
|---|---|---|---|---|
| POST | `/accounts/{account_id}/diagnosis` | — | `DiagnosisResponse{ diagnosis: DiagnosisOutput, report }` | 账号健康诊断（P5.5.1 起为 Account Strategy 的兼容子集）|
| POST | `/contents/{content_id}/analysis` | — | `ContentAnalysisResponse{ analysis: ContentAnalysisOutput, report }` | 单条内容质量分析（P4-1） |
| POST | `/trends/analysis` | `{ platform, period(默认7) }` | `TrendAnalysisResponse{ analysis: TrendAnalysisOutput, report }` | 平台周期内趋势分析（P4-2） |
| POST | `/accounts/{account_id}/topic-recommendation` | — | `TopicRecommendationResponse{ recommendation: TopicRecommendationOutput, report }` | 选题推荐（P5.5.1 起为内部能力直调）|
| POST | `/titles/optimize` | `{ content_id? , title? }`（至少其一） | `TitleOptimizationResponse{ optimization: TitleOptimizationOutput, report }` | 标题优化，固定 3 条（P5.5.1 起为内部能力直调）|
| POST | `/accounts/{account_id}/strategy` | — | `StrategyAdvisorResponse{ strategy: AccountStrategyOutput, report, memory_saved }` | 账号运营诊断+策略（P5.5.1 合并），写 Memory 闭环 |

## 错误语义

- `404`：`account_id` / `content_id` 不存在
- `422`：请求体校验失败（如 `/titles/optimize` 两者皆缺）

## Agent 输出契约（均带回归测试）

- `AccountStrategyOutput`（/strategy 全量）: `{ account_id, account_health(0-100), strengths[], weaknesses[], anomalies[], recommendations[], strategy_summary, weekly_plan[], kpis[], risks[] }`
- `DiagnosisOutput`（/diagnosis 子集）: `{ account_health(0-100), strengths[], weaknesses[], anomalies[], recommendations[] }`
- `ContentAnalysisOutput`: `{ content_id, title?, summary, quality_score(0-100), strengths[], weaknesses[], suggestions[] }`
- `TrendAnalysisOutput`: `{ platform, period, topics[{keyword,title?,post_count}], trend_score(0-100), insights[] }`（topics 以 DB 事实为准）
- `TopicRecommendationOutput`: `{ account_id, topics[{title, rationale, estimated_interest(0-100)}] }`（与已有内容去重）
- `TitleOptimizationOutput`: `{ original, optimized_titles[固定3条], explanation }`

## LLM / 知识库接线（P5.5.3 / P5.5.4）

- 生产入口 `app = create_app(gateway=build_gateway(), retriever=build_knowledge_retriever())`（见 `api/main.py`）。
- `LLM_API_KEY`（`.env`）有效时注入 `LLMGateway`（OpenAI 兼容端点），Agent `analyze` 走 LLM 结构化输出，失败仍回退规则兜底；无 Key 则全部规则兜底。
- 知识库经 `seed-knowledge` CLI 灌入后由 `retriever` 注入，Agent 的 `search_operation_knowledge` 可查询（未注入则为空库）。
