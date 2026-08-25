# SocialMediaAgent 最终架构方案

> 项目：多平台自媒体智能运营 Agent
> 文档定位：最终实施蓝图（含架构分析、目录结构、架构图、数据流、模块职责、P0~P7 计划、DoD、测试、隔离策略、依赖管理）
> 状态：已定稿（决策版）。实施前需按 P0 处理 third_party 整理、ADR 分析等前置项。

---

## 目录

- [一、项目定位与 P0 决策](#一项目定位与-p0-决策)
- [二、最终项目目录结构](#二最终项目目录结构)
- [三、系统架构图（ASCII）](#三系统架构图ascii)
- [四、数据流](#四数据流)
- [五、模块职责与领域模型草案](#五模块职责与领域模型草案)
- [六、P0~P7 实施计划](#六p0p7-实施计划)
- [七、每阶段 Definition of Done](#七每阶段-definition-of-done)
- [八、每阶段需要编写的测试](#八每阶段需要编写的测试)
- [九、第三方代码隔离策略](#九第三方代码隔离策略)
- [十、依赖管理方案](#十依赖管理方案)
- [十一、第一阶段具体任务清单（P0 + P1）](#十一第一阶段具体任务清单p0--p1)
- [附录 A：两个开源项目架构分析（A~F）](#附录-a两个开源项目架构分析af)

---

## 一、项目定位与 P0 决策

### 1.1 项目目标

「多平台自媒体智能运营 Agent」。目标**不是简单整合两个开源项目**，而是：

- **MediaCrawler**：作为数据采集能力的参考/适配来源
- **MatrixFlow**：作为产品业务能力和部分实现思路的参考
- **SocialMediaAgent**：最终项目，自己的代码作为唯一核心代码

`third_party/` 中的开源项目必须保持只读，不直接修改。

### 1.2 现状核对（实施 P0 时必须处理）

`third_party/` 目前是 `MatrixFlow-main/` + `MediaRadar-main/`，**没有独立的 `MediaCrawler-main/`**。MediaCrawler 源码位于 `MediaRadar-main/backend/services/crawler_service/`（且是经过改动的 fork 变体）。按决策，P0 需将其抽取/整理为 `third_party/MediaCrawler-main/`（保持只读），MediaRadar 整体仅作研究参考、不进依赖。

### 1.3 P0 正式决策

1. **主工程统一使用 Python**：FastAPI、Pydantic、SQLAlchemy、LangGraph、pytest、Playwright（确有需要时）。避免引入 Node/Electron 作为核心运行环境。MatrixFlow 中的 JS/TS/Electron 能力只做源码参考，必要逻辑使用 Python 重新实现。
2. **第一阶段单用户模式**：不实现多租户、计费、配额、组织权限体系。但领域模型保留 `owner/observed` 等基础字段，为以后扩展预留空间。
3. **数据库第一阶段使用 SQLite**：通过 SQLAlchemy 抽象数据库访问。模型设计考虑未来迁移 PostgreSQL。不要为了"未来扩展"提前引入 PostgreSQL、Redis 等复杂基础设施。
4. **RAG 第一阶段使用 FAISS**：必须设计 `VectorStore` 抽象接口。以后可替换成 sqlite-vec / Qdrant，但当前不要引入额外向量数据库服务。
5. **third_party 布局**：
   ```
   third_party/
   ├── MatrixFlow-main/
   └── MediaCrawler-main/
   ```
   不引入 MediaRadar。MediaRadar 如需要，只能作为架构研究参考，不进入项目依赖。
6. **不预先决定"移植" MatrixFlow 的代码**（如 llm_gateway、AnomalyService、stats、AI service）。必须先分析源码，再决定：直接参考 / Adapter 封装 / 重新实现 / 不采用。最终核心业务代码必须属于 SocialMediaAgent。
7. **MediaCrawler 接入**：第一阶段允许 `SocialMediaAgent → MediaCrawler Adapter → MediaCrawler → SQLite → Normalizer → Unified Domain Model`。但 MediaCrawler 的 SQLite 不应成为最终业务系统的核心数据库。最终应为：`MediaCrawler → Adapter → Normalizer → Unified Domain Model → SocialMediaAgent Database`。MediaCrawler 必须保持隔离，以便未来替换成官方 API 或其他合法数据源。
8. **MatrixFlow 必须通过 Adapter/Service 层接入**。禁止 `Agent → MatrixFlow 内部实现`。推荐 `Agent → Tools/Services → Data/Business Adapter → 具体实现`。
9. **RAG 与 Memory 必须严格区分**：
   - **RAG**（运营知识）：平台运营规则、内容创作方法、标题写作方法、运营手册、历史优秀案例。
   - **Memory**（账号历史运营特征）：内容定位、高表现内容类型、低表现内容类型、历史运营策略、策略执行结果、账号长期特征。
   - 不要把两者混成一个数据库。
10. **MCP 后置**：P5 之前不开发 MCP。不机械移植 MatrixFlow 的 18 tools。后期根据实际 Agent 需求设计 5~8 个核心 Tool，先让 LangGraph Agent 通过内部 Tool 正常工作，之后再考虑 MCP Server。
11. **Evaluation 作为项目核心能力**（P6 至少实现）：
    - 数据准确性：Agent 输出"最近30天平均点赞为 1234"时应能与数据库 Ground Truth 对比。
    - Tool Calling 正确率：用户要求分析最近10条内容时，Agent 是否调用正确的 Tool。
    - RAG 检索质量、Agent 输出质量、Prompt/Agent 回归测试。
12. **每个阶段必须有 Definition of Done**，特别是 P1（见第七节）。

---

## 二、最终项目目录结构

```
SocialMediaAgent/                          # 仓库根
├── app/                                   # ★ 主工程 = SocialMediaAgent 本体（唯一核心代码）
│   ├── backend/
│   │   ├── pyproject.toml                 # 核心依赖清单（见第十节）
│   │   ├── alembic.ini
│   │   ├── alembic/                       # 数据库迁移（SQLite 起步，设计兼容 PG）
│   │   ├── src/socialmedia_agent/
│   │   │   ├── __init__.py
│   │   │   ├── config/settings.py         # pydantic-settings；.env；三层回退模式(参考 MediaRadar 思路)
│   │   │   ├── database/
│   │   │   │   ├── engine.py  session.py  base.py  (SQLAlchemy 2.0 风格)
│   │   │   ├── domain/                    # ★ 纯领域模型（Pydantic，不绑 ORM）
│   │   │   │   ├── account.py  content.py  metric.py  comment.py  topic.py
│   │   │   │   ├── enums.py               # Platform, ContentType, MetricType, OwnerType, Source
│   │   │   │   └── identity.py            # ★ canonical_id 生成/解析规则
│   │   │   ├── models/                    # ORM 映射（domain ↔ DB，含迁移友好）
│   │   │   ├── repositories/              # account_repo.py content_repo.py metric_repo.py comment_repo.py topic_repo.py
│   │   │   ├── normalizers/               # ★ 口径归一化
│   │   │   │   ├── base.py  rules.py  registry.py  numbers.py  time.py  ids.py
│   │   │   ├── connectors/                # ★ 第三方接入的唯一边界（隔离层）
│   │   │   │   ├── base.py                # PlatformConnector ABC
│   │   │   │   ├── mediacrawler/
│   │   │   │   │   ├── adapter.py         # 对外唯一入口：run + fetch
│   │   │   │   │   ├── runner.py          # 隔离 venv subprocess 调度
│   │   │   │   │   ├── reader.py          # 读取 MediaCrawler 中转 SQLite（显式 schema 映射，非列名探测）
│   │   │   │   │   └── schemas.py         # 中转库结构定义
│   │   │   │   └── matrixflow_ref/        # (P5+) 自有账号数据适配（参考 MatrixFlow，Python 重写/封装）
│   │   │   ├── services/                  # 业务编排
│   │   │   │   ├── ingest.py  sync.py  scheduler.py  report.py  health.py
│   │   │   ├── llm/
│   │   │   │   ├── gateway.py             # ★ LLM Gateway：多提供商/JSON/pydantic 校验/重试/熔断/缓存
│   │   │   │   ├── providers/  circuit_breaker.py  cache.py  token_budget.py
│   │   │   ├── rag/                       # ★ 运营知识库（与 Memory 严格分离）
│   │   │   │   ├── vector_store.py        # ★ 抽象接口（add/search/delete）
│   │   │   │   ├── faiss_store.py         # Phase1 实现（FAISS）
│   │   │   │   ├── embedder.py            # 抽象 + 远端/本地实现
│   │   │   │   ├── documents.py           # 知识文档管理（知识源入库 core DB）
│   │   │   │   └── retriever.py
│   │   │   ├── memory/                    # ★ 账号历史运营特征（独立存储，独立 DB）
│   │   │   │   ├── store.py  summarizer.py  models.py  ttl.py
│   │   │   ├── agents/                    # ★ LangGraph
│   │   │   │   ├── graph_builder.py  base.py  state.py  router.py
│   │   │   │   ├── tools/                 # ★ 内部 Tool（8 个，先于 MCP）
│   │   │   │   │   ├── registry.py
│   │   │   │   │   ├── get_account_profile.py  get_recent_contents.py  get_content_metrics.py
│   │   │   │   │   ├── analyze_content_performance.py  search_operation_knowledge.py
│   │   │   │   │   ├── get_trend_data.py  get_historical_strategy.py  save_operation_memory.py
│   │   │   │   ├── account_diagnosis/     # P3
│   │   │   │   │   ├── graph.py  nodes.py  prompts.py  schemas.py
│   │   │   │   ├── content_analysis/  trend_analysis/  topic_recommend/  title_optimize/  strategy_advisor/   # P4
│   │   │   ├── api/                       # FastAPI
│   │   │   │   ├── main.py  deps.py
│   │   │   │   └── routers/ accounts.py contents.py metrics.py diagnosis.py agent.py knowledge.py memory.py trends.py
│   │   │   ├── evaluation/                # ★ P6 核心能力
│   │   │   │   ├── ground_truth.py  tool_call_verify.py  rag_metrics.py  agent_output.py  regression.py  runner.py
│   │   │   └── cli/                       # ingest.py knowledge.py memory.py eval.py db.py
│   │   └── tests/
│   │       ├── conftest.py                # fixtures：内存 SQLite / 假 LLM / 假爬虫 / 知识库样本
│   │       ├── unit/                      # normalizers / identity / models / llm / vector_store / memory
│   │       ├── integration/               # ingest 全链路 / repositories / API
│   │       ├── agent/                     # 诊断 Agent 回归 / 工具调用 / 输出 schema
│   │       └── evaluation/                # 评测套件本身
│   ├── frontend/                          # (P5+ 可选) 单一轻量前端，P0 只建空占位
│   └── scripts/                           # dev 辅助脚本（seed 知识库、清库、演示）
├── docs/
│   ├── adr/                               # ★ 架构决策记录（ADR）
│   │   └── 0001-*.md …                    # 每个"移植候选"的分析→结论都记这里
│   ├── architecture.md  data-model.md  contracts.md  evaluation.md  compliance.md
├── third_party/                           # ★ 只读，不 import
│   ├── MatrixFlow-main/
│   ├── MediaCrawler-main/                 # P0 从 MediaRadar 中抽出（只读）
│   ├── MediaRadar-main/                   # 仅架构研究参考（可不保留，按 P0 决策）
│   └── README.md                          # 说明来源/许可证/只读约定
├── .gitignore  .env.example  README.md  LICENSE
└── docker-compose.yml                     # (P7) 仅后端 + 可选 MCP
```

---

## 三、系统架构图（ASCII）

```
┌───────────────────────────── 接入层 ────────────────────────────────┐
│  FastAPI /api/v1/*         CLI            Scheduler(APScheduler)     │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│                       Agent 层 (LangGraph)                           │
│  GraphBuilder / State / Router                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ AccountDiagnosis (P3)  ◄── 唯一先做                            │  │
│  │ ContentAnalysis │ TrendAnalysis │ TopicRecommend │              │  │
│  │ TitleOptimize   │ StrategyAdvisor  (P4 逐个加)                  │  │
│  └───────────────┬────────────────────────────────────────────────┘  │
│                  │ 内置 Tool (先内部，后 MCP P5+)                     │
│   get_account_profile · get_recent_contents · get_content_metrics    │
│   analyze_content_performance · search_operation_knowledge           │
│   get_trend_data · get_historical_strategy · save_operation_memory   │
└───┬────────────────┬──────────────────┬──────────────────────────────┘
    │                │                  │
┌───▼───────┐  ┌─────▼───────┐  ┌───────▼──────────────┐
│ LLM Gateway│  │ RAG 运营知识 │  │ Memory 账号历史特征  │
│ 多提供商   │  │ VectorStore │  │ 独立存储             │
│ JSON/校验  │  │ (FAISS impl)│  │ 独立 DB              │
│ 熔断/重试  │  │ +知识文档表  │  │ TTL+摘要+演化记录     │
└───┬───────┘  └─────┬───────┘  └───────┬──────────────┘
    │                │                  │
┌───▼────────────────▼──────────────────▼─────────────────────────────┐
│                    Service 层（编排/事务/幂等）                        │
│   IngestService · SyncService · ReportService · HealthService        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│            Repository + Domain + Normalizer                          │
│   Account / Content / Metric / Comment / Topic（统一模型）            │
│   Normalizer：'12.3万'→123000 · 平台口径对齐 · canonical_id 派生      │
│   SQLAlchemy → SQLite（未来可切 PG）                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                Connector / Adapter 层（★唯一接触第三方边界）           │
│   ┌─────────────────────┐   ┌───────────────────────────────┐      │
│   │ MediaCrawler Adapter│   │ 自有账号 Adapter (P5+, Python) │      │
│   │ run→read→normalize  │   │ 参考 MatrixFlow 逻辑          │      │
│   └─────────┬───────────┘   └───────────────────────────────┘      │
│             │ 隔离 venv / subprocess                                │
│   ┌─────────▼──────────────────────────────────────────────┐       │
│   │ third_party/（只读，不 import）                          │       │
│   │   MediaCrawler → 自有中转 SQLite（临时，非核心库）        │       │
│   │   MatrixFlow-main → 仅源码参考                           │       │
│   └────────────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────────────┘
```

**分层规则（依赖方向单向）**：

`接入层 → Agent层 → Service/Repository/LLM/RAG/Memory → Connector/Adapter → third_party(只读)`

领域层与第三层（third_party）**零接触**；Agent 禁止直接调用任何第三方实现。

---

## 四、数据流

### 4.1 采集数据流（P1 阶段，允许中转，但核心库权威）

```
Scheduler/CLI/API 触发
→ MediaCrawlerAdapter.run(platform, keyword)
→ [MediaCrawler 隔离环境 → 写入其自有 SQLite（仅作临时中转）]
→ Adapter.reader 按显式 schema 读取
→ Normalizer（数值/时间/ID 口径统一 → canonical_id 派生）
→ Repository 幂等写入 ★SocialMediaAgent 核心库（唯一权威）
   幂等键：canonical_id + captured_at（去重/增量更新）
```

### 4.2 目标数据流（重构后，中转库不再承载业务）

```
MediaCrawler → Adapter → Normalizer → Unified Domain Model → SocialMediaAgent DB
```

### 4.3 查询/Agent 数据流

```
用户请求（API）
→ LangGraph Agent
→ 内置 Tool → Repository（核心库）/ RAG（运营知识）/ Memory（账号历史）
→ LLM Gateway（结构化输出 + 人类可读报告）
→ API 返回 { structured_json, report_markdown }
```

### 4.4 RAG / Memory 数据流（严格分离）

```
RAG：写入=运营知识文档(seed/CRUD)→embedding→FAISS；读取=query→向量检索→LLM 上下文
Memory：写入=每次诊断/策略执行后沉淀账号特征；读取=Agent 启动时注入该账号历史特征
```

---

## 五、模块职责与领域模型草案

### 5.1 模块职责

| 模块 | 职责 | 关键约束 |
|---|---|---|
| `domain/` | 纯数据契约（Pydantic），跨层 DTO | 不依赖 DB/LLM/第三方 |
| `models/ + repositories/` | ORM 映射与数据访问 | 全部走 repo，禁止散落 SQL |
| `normalizers/` | 数值("12.3万"→123000)、时间(平台格式→ISO)、ID(canonical_id 派生)、单位/口径对齐 | 每个平台注册一套规则，`registry` 路由 |
| `connectors/mediacrawler/` | 唯一负责调用 MediaCrawler；中转库读取；错误/超时/重试 | 隔离、可整体替换为官方 API |
| `connectors/matrixflow_ref/` | (P5+) 自有账号数据（发布/统计），Python 实现 | 同上，可替换 |
| `services/ingest` | 采集编排：触发→读取→归一→入库（幂等） | P1 DoD 核心 |
| `llm/gateway.py` | 统一 LLM：多提供商、JSON 模式、pydantic 校验、重试、熔断、缓存、token 预算 | 参考 MediaRadar `llm_gateway` 思路（ADR 定结论） |
| `rag/` | 运营知识：文档管理 + 向量索引 + 检索 | 接口抽象；FAISS 为 Phase1 实现 |
| `memory/` | 账号历史运营特征：存储/摘要/演化/TTL | 独立 DB，与 RAG 物理分离 |
| `agents/tools/` | 8 个内部 Tool，供 LangGraph 节点调用 | 内部工具优先；MCP 后置 |
| `agents/account_diagnosis/` | P3：账号诊断图 + 结构化输出 + 人类报告 | 输出 JSON 契约固定 |
| `api/` | FastAPI 路由 | 领域模型对外序列化 |
| `evaluation/` | 数据准确性 / Tool 正确率 / RAG 质量 / 输出质量 / 回归 | 与测试打通，P6 |
| `cli/` | 采集、知识库种子、memory 管理、评测、db 工具 | 支持"流程可重复执行" |

### 5.2 领域模型草案（P0 交付物，写进 `docs/data-model.md`）

- **Account**：`id, canonical_id(唯一), platform, platform_id, nickname, avatar_url, owner_type(owner|observed), extra(JSON)`
- **Content**：`id, canonical_id, platform, platform_content_id, account_id(FK), title, content, content_type(video|image|article|note), publish_time, url, raw_metadata(JSON)`
- **Metric**：`id, content_id(FK, 可空), account_id(FK, 可空), platform, metric_type(views|likes|comments|shares|favorites), value(Numeric), captured_at, source(mediacrawler|matrixflow|official_api|manual), raw_value(原串,审计)`
- **Comment**：`id, platform, platform_comment_id, content_id(FK), parent_comment_id, author_nickname, content, like_count, publish_time`
- **Topic**：`id, keyword, title, platforms, first_seen, last_seen, post_count, summary, sentiment(JSON/文本)`（P4 趋势/选题用）
- **canonical_id 规则**：`f"{platform}:{platform_id}"`（明文可解析；P0 定案写文档）。

---

## 六、P0~P7 实施计划

| 阶段 | 主题 | 内容 | 产出 |
|---|---|---|---|
| **P0** | 地基 | 仓库整理（third_party 只读化、MediaCrawler 抽出为 `MediaCrawler-main/`）；pyproject/CI；配置；DB 引擎+Alembic；domain 全模型；normalizer 骨架；VectorStore 抽象接口；ADR 流程启动 | 目录结构、`docs/data-model.md`、`docs/adr/*` |
| **P1** | 数据接入 | MediaCrawler Adapter（隔离 venv + 显式 schema 读取 + 幂等入库）；Normalizer 完整实现（至少 1 平台）；API 查询；重复执行能力 | 一个平台真实数据入核心库并可查询 |
| **P2** | Agent 内核 | LLM Gateway；RAG（FAISS + 运营知识种子文档）；Memory（账号特征存储/摘要）；LangGraph builder + 8 个内部 Tool | Agent 可跑通最小图 |
| **P3** | 首个 Agent | **Account Diagnosis Agent**（输入账号+近期内容+历史指标 → 结构化 JSON + 人类报告） | 端到端可演示的诊断能力 |
| **P4** | Agent 扩展 | 逐个加入 Content Analysis / Trend Analysis / Topic Recommendation / Title Optimization / Strategy Advisor | 6 个 Agent 全可用 |
| **P5** | 编排与对外 | 定时调度+周报；API 完善；**内部 Tool 稳定后设计 5~8 个 MCP Tool 并实现 MCP Server**；自有账号数据接入（参考 MatrixFlow，Python 实现，先 ADR 分析）；可选轻量前端 | 完整产品闭环 |
| **P6** | Evaluation | 数据准确性（DB Ground Truth 对比）、Tool Calling 正确率、RAG 检索质量、Agent 输出质量、Prompt/Agent 回归 | 评测套件可跑、CI 集成 |
| **P7** | 打磨 | 部署（docker-compose）、README/演示、合规声明、性能/日志、License 确认 | 可交付简历项目 |

> **每个"移植候选"（llm_gateway / AnomalyService / stats / AI service / MCP tools…）在各自阶段前必须走一次 ADR 分析，四选一结论：参考 / Adapter 封装 / 重新实现 / 不采用**。P0 阶段先产出「MatrixFlow 模块三线表」初稿，但**结论留待源码逐项分析后再定**，不在本方案预判。

---

## 七、每阶段 Definition of Done

### P0

- `pytest` 可跑且 0 失败
- `alembic upgrade head` 生成完整 schema
- domain 与 ORM 往返测试通过
- `VectorStore`/`Embedder` 接口定义完成（FAISS 实现可选）
- `normalizer` 骨架+接口通过
- `docs/adr/` 建立
- third_party 整理完毕且只读校验通过（git submodule 或权限约定）

### P1（9 条，逐条落实）

1. 至少 1 个平台获取到**真实数据**（非 mock）
2. 数据成功进入 MediaCrawler 中转（原始数据可审计）
3. Normalizer 工作正常（数值/时间/ID 断言通过）
4. 数据进入**统一领域模型**并落核心库
5. `Account / Content / Metric` 可关联查询
6. `canonical_id` 可建立跨表关联（Content→Account）
7. FastAPI 可查询（账号/内容/指标接口返回正确数据）
8. pytest 有对应测试（unit+integration）
9. 采集流程**可重复执行**（幂等，重复跑不产生脏数据/重复记录）

> 补充：全程不依赖 MediaCrawler 的 SQLite 作为业务查询源。

### P2

- [x] LLM Gateway 至少对接 1 个提供商并通过 mock 测试（`test_llm_gateway.py::test_openai_compat_provider_calls_endpoint`，httpx2 MockTransport）
- [x] 熔断/重试生效（`test_llm_gateway.py`：OPEN 短路/恢复/临时失败重试）
- [x] RAG 可写入知识文档并召回（召回断言）（`test_faiss_store.py::test_retriever_recalls_matching_document`）
- [x] Memory 可存/取/摘要账号特征（`test_memory.py`，独立 DB + TTL）
- [x] LangGraph 最小图（含工具调用）跑通（`test_agent_graph.py`，规则路由 → 内部 Tool）
- [x] 8 个内部 Tool 均可独立调用并有测试（`test_agent_tools.py`，10 条）

> **状态（2026-08-24 记录）**：P2 全部六条 DoD 达成，全量 `pytest` 152 passed。
> 说明：P2 最小图使用确定性规则路由（不依赖 LLM），保证可测；P3 起由 LLM 决策工具调用。真实提供商接入需 `.env` 密钥（不入库），OpenAI 兼容端点（DeepSeek 等）经 mock 验证。

### P3

输入（账号+近期内容+历史指标）→ 输出严格满足：

```json
{ "account_health": 0-100, "strengths": [], "weaknesses": [],
  "anomalies": [], "recommendations": [] }
```

- [x] 同时产出人类可读报告（`render_report` 规则渲染 markdown）
- [ ] 用 P1 真实数据端到端演示（待 crawler venv + 真机数据；已具备 `POST /api/v1/accounts/{id}/diagnosis` + fixture 数据端到端）
- [x] 输出 schema 有回归测试（`tests/agent/test_account_diagnosis.py::test_diagnosis_output_schema_strict` + `test_diagnosis_end_to_end`）
- [x] **Agent 引用的统计数字与 DB 可核验**（facts 注入 LLM prompt，`test_statistics_injected_into_prompt` 断言 total_views=1500；为 P6 铺垫）

> **状态（2026-08-24 记录）**：P3 Account Diagnosis Agent 已完成并提交（`agents/account_diagnosis/`，ADR-0003）。
> 端到端入口：`POST /api/v1/accounts/{account_id}/diagnosis`（gateway=None 时走确定性规则兜底，无需 LLM 密钥即可演示；注入 LLMGateway 后启用 LLM 分析）。
> **唯一待办**：P1 真机数据端到端演示（依赖 crawler venv，与 P1.11/1.12 一起阻塞）。全量 `pytest` 159 passed。

### P4

- [x] 每个 Agent 有固定输入/输出契约、prompts、节点图、单测+fixture e2e（`agents/{content_analysis,trend_analysis,topic_recommendation,title_optimization,strategy_advisor}/` + 各自 `tests/agent/` 契约/e2e）
- [x] 全部通过回归套件（`pytest` 217 passed）
- [x] 可组合调用（`tests/agent/test_p4_composition.py`：诊断→内容分析→选题→标题优化→策略 关联一致；最小图 Agent 级路由组合）

> **状态（2026-08-24 记录）**：P4 全部三条 DoD 达成，已提交并推送。
> 产出：Content Analysis / Trend Analysis / Topic Recommendation / Title Optimization / Strategy Advisor 五个 Agent 全可用；
> 新增第 9 个内部 Tool `get_content_details`；`get_trend_data` 接入 Topic 数据层（`TopicRepository`，平台+周期过滤）；
> Memory 读-写闭环（Strategy Advisor persist → `save_operation_memory`）；Memory 独立库接线（`SMA_MEMORY_DB_URL` / `build_memory_store`）。
> API：`POST /api/v1/contents/{id}/analysis`、`/trends/analysis`、`/accounts/{id}/topic-recommendation`、`/titles/optimize`、`/accounts/{id}/strategy`（gateway=None 规则兜底可无密钥演示）。

### P5

- [x] 调度与周报运行正常（`services/scheduler.py` APScheduler 每周一 09:00 + `services/weekly_report.py` 聚合近 7 天表现并复用 Account Strategy Agent，`tests/unit/test_scheduler.py`、`test_weekly_report.py`）
- [x] API 文档完整（6 个 Agent 端点 response_model 自文档化 + `docs/api.md` 接口清单 + `tests/integration/test_openapi.py`）
- [x] MCP Server 实现 5~8 个核心 Tool（基于已验证的内部 Tool，非机械移植）：`services/mcp_server.py` FastMCP stdio，7 个 Tool（account_strategy/内容分析/趋势/选题/标题/账号/内容，P5.5.1 合并诊断+策略），`tests/unit/test_mcp_{tools,server}.py`
- [ ] 自有账号接入（经 ADR）完成并有测试（**ADR-0004 已决策**：浏览器自动化不采用、官方能力优先 + Python 重写只读适配器；适配器实现+测试为后续子任务）

> **状态（2026-08-25 更新）**：P5 前三项 DoD 达成，全量 `pytest` 254 passed。
> 新依赖：`apscheduler>=3.10`、`mcp>=1.0,<2.0`、`pydantic-settings>=2.0`（并入 pyproject）。
>
> **P5.5 架构收敛（2026-08-25）**：
> - **Agent 收敛**：6 Agent → 3 核心 Agent（`account_strategy` 合并 诊断+策略）+ 2 内部能力（标题优化/选题推荐降级，删 graph.py）；HTTP API 契约零破坏（`/diagnosis` 为兼容 shim）；MCP 8→7。
> - **配置层**：`config.py`（pydantic-settings 三层回退）+ `.env.example`（LLM 密钥不硬编码）。
> - **LLM Gateway 注入**：`llm/factory.build_gateway` + `create_app(gateway=)` 依赖注入（API/MCP/周报），无密钥规则兜底，mock 注入测试链路。
> - **RAG seed**：`seed-knowledge` CLI + `FaissVectorStore.save/load` 持久化 + 可选 `OpenAICompatEmbedder`；`create_app(retriever=)` 注入，Agent 可查询知识库。
> - **日志**：`logging_config` + Connector/LLM/Agent/RAG/Memory 分层日志（禁输出密钥/消息内容）。
>
> **待办**：自有账号只读适配器（`connectors/matrixflow_ref/`）按 ADR-0004 实现 + 测试；发布写操作另行合规评估。

### P6

5 项评估全部落地且可一键运行：

1. 数据准确性（Agent 声称 vs DB Ground Truth 差异）
2. Tool Calling 正确率（"分析最近10条"→断言调用 `get_recent_contents`）
3. RAG 检索质量（命中率/NDCG 类指标）
4. Agent 输出质量（schema+人工评分抽样）
5. Prompt/Agent 回归（变更不破坏既有行为）

CI 强制运行。

### P7

- `docker compose up` 一键起
- README/架构图/演示脚本齐全
- 合规声明（License 保留、数据合规边界）写入 `docs/compliance.md`
- 日志与性能达标

---

## 八、每阶段需要编写的测试

| 阶段 | 测试 |
|---|---|
| P0 | unit：模型序列化往返、enums、canonical_id 生成/解析、normalizer 接口契约、VectorStore 接口（用假实现） |
| P1 | unit：normalizer（"12.3万"/"1.2亿"/纯数字/时间格式/ID 派生）；integration：mock 爬虫→中转→读取→归一→入库全链路、幂等重复执行、Account/Content/Metric 关联、API 查询 |
| P2 | unit：LLM Gateway（mock provider、熔断、重试、JSON 校验）、FAISS add/search/delete、Memory store/摘要/TTL；agent：最小图 + 工具调用冒烟 |
| P3 | agent：输入→输出 schema 断言、统计数字与 fixture DB 一致性、假 LLM 下确定性输出、人类报告非空 |
| P4 | agent：每 Agent 契约测试、fixture e2e、工具组合测试 |
| P5 | integration：调度器、周报、MCP 工具（stdio 调用）、自有账号 adapter（mock 浏览器） |
| P6 | evaluation：ground_truth 比对、tool_call_verify（记录并断言工具序列）、rag_metrics、agent_output、回归快照 |
| P7 | smoke：docker 起服务、健康检查、演示脚本校验 |

测试基建统一：`pytest + pytest-asyncio + fixtures（内存 SQLite / 假 LLM / 假爬虫 / 知识库样本）`，`conftest.py` 集中管理。

---

## 九、第三方代码隔离策略

1. **只读**：`third_party/` 不进主工程 import 路径；用 git submodule 或 `.gitignore` + 约定保证不修改；CI 校验该目录无改动。
2. **唯一边界**：仅 `connectors/` 与第三方交互；`domain/`、`agents/`、`services/`、`api/` 禁止出现第三方 import 或路径引用。
3. **MediaCrawler 隔离**：独立 venv/requirements；其 SQLite 仅作临时中转；核心库为唯一权威；Adapter 内封装 `runner`（调度）+`reader`（显式 schema 读取，不做动态列名探测）。
4. **可替换性**：`PlatformConnector` ABC 保证未来可换官方 API / 其他数据源，业务层无感。
5. **MatrixFlow 隔离**：只作源码参考；任何采用都必须走 ADR（参考/封装/重写/不采用），主工程代码为 Python 重写或封装结果，版权引用注释保留。
6. **合规**：保留第三方 LICENSE 头；`docs/compliance.md` 记录使用边界（非商用许可、数据合规）。
7. **ADR 记录**：每个"是否复用某模块"的决策落在 `docs/adr/`，作为简历可展示的架构治理证据。

---

## 十、依赖管理方案

| 环境 | 依赖 | 说明 |
|---|---|---|
| **核心环境**（唯一业务环境） | fastapi, uvicorn, pydantic, pydantic-settings, SQLAlchemy≥2.0, alembic, langgraph(锁定版本,注意 API 兼容), openai(OpenAI 兼容端点→DeepSeek 等), faiss-cpu, numpy, apscheduler, httpx, tenacity | `pyproject.toml` 管理；dev 依赖：pytest, pytest-asyncio, ruff, mypy, pytest-cov |
| **MediaCrawler 隔离环境** | playwright, sqlalchemy-async, aiosqlite, asyncmy(可选), redis(可选) 等 | 独立 `requirements-crawler.txt` / 独立 venv，**绝不装进核心环境**（规避现 MediaRadar 依赖缺失/版本混乱问题） |
| **向量** | Phase1 用 `faiss-cpu`（无外部服务）；Embedder 优先远端 OpenAI 兼容 embedding（BGE-M3 等），本地 `sentence-transformers` 作为可选实现 | 通过 `Embedder`/`VectorStore` 接口隔离，后续可切 sqlite-vec/Qdrant 而不动业务 |
| **版本策略** | 锁定 `langgraph`/`openai`/`SQLAlchemy` 主版本；`pip-compile` 或 uv 生成 lockfile；CI 复现安装 | 规避 MediaRadar 曾出现的 py3.8/3.11 不一致问题 |
| **密钥** | `.env`（gitignore）；`.env.example` 提交占位 | 绝不入库 |
| **DB** | SQLite（`data/sma.db`）+ 独立 `data/memory.db`（Memory 物理分离）；Alembic 迁移从 SQLite 起步，写代码时避免 PG 不兼容方言 | 不提前引入 PG/Redis |

---

## 十一、第一阶段具体任务清单（P0 + P1）

### P0 任务

- [ ] 0.1 third_party 整理：从 `MediaRadar-main/backend/services/crawler_service/` 抽出为 `third_party/MediaCrawler-main/`（只读，保留 LICENSE 头）；确认 MatrixFlow-main 只读；写 `third_party/README.md`
- [ ] 0.2 建立 `app/backend/` 骨架：pyproject、src 布局、`.env.example`、`docs/adr/` 模板
- [ ] 0.3 配置层：`Settings`（pydantic-settings，三层回退思路）
- [ ] 0.4 数据库：SQLAlchemy 2.0 engine/session + Alembic 初始化
- [ ] 0.5 **领域模型**：Account/Content/Metric/Comment/Topic + enums + `identity.py(canonical_id)` + ORM 映射（提交 `docs/data-model.md`）
- [ ] 0.6 Normalizer 骨架：接口 + registry + 数值/时间/ID 三个实现（首平台规则可后填）
- [ ] 0.7 `VectorStore`/`Embedder` 抽象接口 + `FAISS` 占位实现（可延至 P2 填充，但接口先行）
- [ ] 0.8 pytest 基建 + 上述单测
- [ ] 0.9 （启动项）MatrixFlow/MediaRadar 关键模块源码分析，产出「三线表」初稿供各阶段 ADR 使用

### P1 任务

- [x] 1.1 搭建 MediaCrawler 隔离 venv + 依赖清单（venv 已建、`requirements-crawler.txt` 已出；真机跑通阻塞于依赖未装）
- [x] 1.2 `runner.py`：subprocess 调度（超时/重试/日志）
- [x] 1.3 `reader.py`：显式 schema 读取中转 SQLite（明确字段映射，禁止列名探测）
- [x] 1.4 `schemas.py`：中转库结构与目标 domain 的字段映射表
- [x] 1.5 **Normalizer 完整实现**：数值口径（"万/亿"）、时间格式、ID 派生、平台规则注册
- [x] 1.6 `repositories`：Account/Content/Metric 增查；幂等 upsert（canonical_id+captured_at 去重）
- [x] 1.7 `IngestService`：单平台抓取→读取→归一→入库全链路
- [x] 1.8 FastAPI：`/api/v1/accounts`、`/contents`、`/metrics` 查询接口
- [x] 1.9 CLI：`ingest` 命令（保证流程可重复执行）
- [x] 1.10 测试：normalizer 单测、ingest 集成测试（fixture 假爬虫）、幂等测试、API 集成测试（全量 110 passed）
- [ ] 1.11 端到端验证：真实数据入库 → API 查询 → 关联成立 → `pytest` 全绿
- [ ] 1.12 **DoD 验收（第七节 P1 九条逐项打勾）**

> **状态（2026-08-24 记录）**：1.1~1.10 已完成并提交，全量 `pytest` 110 passed。
> **阻塞项**：1.11/1.12 依赖 crawler venv（`.venv-crawler`）安装 MediaCrawler 依赖 + `playwright install chromium`（命令见 `app/backend/requirements-crawler.txt`）。用户确认改由 AI 装，但安装命令被用户中止，暂缓。
> **决定**：P1 真机验收延后，优先推进 P2（Agent 内核）。1.12 中不依赖真机的条款（Normalizer/关联查询/canonical_id/API/幂等，即 DoD 3~9 条）已由现有测试覆盖，待 1.11 完成后统一逐条打勾。

---

## 附录 A：两个开源项目架构分析（A~F）

> 本节为方案定稿前的分析底稿（第一轮分析产出），保留以备后续 ADR 引用。

### A. 架构分析

#### A1. MatrixFlow — Electron 桌面应用（内容发布/运营）

- **技术栈**：Node.js 18+ / TypeScript 5 / Electron 41 / Vue 3 / Pinia / Element Plus / SQLite (better-sqlite3) / Patchright（Playwright stealth 分支）/ MCP SDK。
- **分层**：渲染进程(Vue3) → preload.ts(contextBridge 白名单) → 主进程 → 外部依赖。
- **核心模块**：
  - `electron/core/`：BrowserPool, BrowserContext, TaskScheduler, QueueManager, RateLimiter, EventBus, CryptoService(AES-256-GCM), SecurityLayer, ConfigManager, Logger, SelectorUpdateService, SignatureVerifier
  - `electron/services/`：Account/Publish/Stats/Content/Draft/Comment/Monitor/Proxy/Fingerprint/Group/MultiPanel/License/WeeklyReport/Material, AnomalyService, Watchdog, session-manager
  - `electron/platform/`：base(BaseAdapter, PlatformRegistry, RiskControl, publishTiming) + 5 平台适配器（douyin/xiaohongshu/channels/kuaishou/bilibili），每平台 publish/login/cookie/comment/selectors/stats/upload/schedule
  - `electron/data/`：Database + 17 个 migrations + 18 个 Repository（22+ 张表，WAL 模式）
  - `electron/ai/`：LLMService(多提供商)/AIService(发布前检查/规则优化/异常检测/周报)/AICache(LRU+TTL)
  - `mcp-server/`：独立 npm 包，18 个 Tool（account/content/publish/stats 4 组），stdio 传输
  - `src/renderer/`：11 个视图、8 个 Pinia store
  - 遗留（官方标记废弃，勿用）：`src/douyin/`、`src/stores/`、`electron/browser/`、`electron/scheduler/`
- **LangGraph 使用**：无。MatrixFlow 的 AI 是"规则+LLM 调用"封装，无图编排。

#### A2. MediaRadar — Python 全栈舆情分析系统（含 MediaCrawler）

- **技术栈**：Python 3.11 / FastAPI / SQLite / LangGraph / OpenAI SDK / APScheduler / Qdrant / Playwright / Next.js 15 / uni-app。
- **分层**：FastAPI gateway(8008) → core + services。
  - `core/`：config(三层回退), auth(JWT+OAuth), quota, model_config_db, agent_memory_db, circuit_breaker, metrics, rate_limiter, sanitize, security_middleware, qdrant_client, logger
  - `services/radar_service/`：Pipeline(Screener→Vision→Cluster→Alert) + LangGraph 分析子图(analyst→reviewer→director) + Qdrant RAG + APScheduler + notifier(邮件/企微/飞书/RSS)
  - `services/agent_service/`：function-calling 26 工具 + SSE + Memory(jieba/TTL) + Reflection + Self-Healing + TokenBudget
  - `services/crawler_service/`：★=MediaCrawler 副本★（7 平台：xhs/dy/ks/bili/wb/tieba/zhihu）
  - `services/search_lib/`：crawler_adapter(用 subprocess 调 MediaCrawler main.py，再从 sqlite_tables.db 动态读表)
- **MediaCrawler 子模块**：Playwright 异步爬虫；`base/base_crawler.py` 定义 AbstractCrawler/AbstractLogin 抽象基类；每平台 client/core/login/field/help；数据库用 SQLAlchemy async（models.py 定义 bilibili_video, douyin_aweme, xhs_note 等**按平台分表**）；存储支持 sqlite/mysql/postgres/json/excel；代理池；Redis/内存缓存。
- **LangGraph 使用点**：`analysis_graph.py` 三节点图（analyst→reviewer→director，条件路由），已实践 **RAG 增强**（retrieve_similar_cases 注入案例）+ **话题演化上下文注入**。

### B. 数据流分析

- **B1 MediaRadar 闭环（舆情）**：Search/Cron → crawler_adapter(线程池 subprocess) → MediaCrawler 写自有 sqlite_tables.db（按平台分表，列名异构）→ crawler_adapter 用"候选列名探测"读回 → Pipeline(Screener→Vision→Cluster) → LangGraph(analyst→reviewer→director，analyst 先查 Qdrant RAG) → radar_state.db → notifier。
- **B2 MatrixFlow 闭环（发布/自有账号）**：UI → IPC → services → 数据库；发布=TaskScheduler→BrowserPool→adapter(Patchright)→publish_tasks/video_stats；统计=StatsService→video_stats→AnomalyService/WeeklyReport/AIService。
- **B3 数据冲突点**：
  - 数据库：MatrixFlow 自有 SQLite + sqlite_tables.db + radar_state.db，3 个以上互不相通 SQLite 库
  - 账号模型：自有账号(带 cookie, 可发布) vs 观察对象(仅 uid/nickname)
  - ID 体系：自产 TEXT id + platform_video_id vs aweme_id/note_id/tweet_id/video_id(类型异构)
  - 指标字段：INTEGER 计数 vs 字符串(如"12.3万")、不同单位
  - 自动化：Patchright(Node) vs Playwright(Python)，跨进程无法共享 context

### C. 模块复用建议

- **C1 MatrixFlow 保留建议**（面向"账号诊断/趋势/发布数据"）：
  - `platform/base/` 适配器框架 + 5 平台 selectors/publish/stats 逻辑 → 移植为 Python adapters 或保留为 Node worker
  - BrowserPool / RateLimiter / TaskScheduler / stealth/fingerprint/proxy → 概念移植
  - `ai/LLMService` 多提供商封装 + AICache → 移植为 Python `llm_gateway`
  - `services/AnomalyService, WeeklyReportService, MonitorService` → 逻辑移植为分析 agent 的节点
  - `mcp-server/`（18 tools）→ 保留为独立包（后置决策）
  - 数据模型 accounts/contents/publish_tasks/video_stats → 统一模型参照
  - CryptoService(AES-GCM)、ConfigManager、EventBus、Logger → 通用基建
  - **不建议保留**：Electron 壳、License/激活、AutoUpdater、MultiPanel、Sentry、electron-builder 打包、src/renderer 前端（若选 Python 后端则前端重写）
- **C2 MediaRadar 保留建议**（面向"AI 分析/知识/记忆"）：
  - `radar_service/analysis_graph.py` (LangGraph 子图+条件路由) → 直接移植为 Agent 编排范式
  - `vector_store.py` (Qdrant RAG 检索/写入/迁移) → 移植，可换 FAISS/sqlite-vec 降部署成本
  - `llm_gateway.py`（多引擎+熔断+重试+pydantic 校验）→ 移植为统一 `shared/llm_gateway`
  - `agent_service/`（function-calling+SSE+Memory+Reflection+Self-Healing+TokenBudget）→ 移植 Agent 引擎框架
  - `agent_memory_db` / `model_config_db` / `circuit_breaker` / `metrics` / `logger` / `config` 三层回退 → 直接复用
  - `notifier/`（email/wecom/feishu/rss）→ 保留
  - `crawler_service`(MediaCrawler) → 作为第三方原样保留、以子进程/容器调用
  - scheduler(APScheduler) → 复用
  - **不建议保留**：多用户 auth/配额/subscription 体系、Next.js 与 uni-app 双前端、`search_lib` 的 subprocess 动态读表方式
- **C3 必须新建的"胶水"**：统一领域模型 + 规范 ID；指标归一化层；自有账号数据采集 adapters 与公共内容采集 adapters 统一为 `PlatformSourceAdapter` 接口

### D. 风险列表

| # | 风险 | 等级 | 说明/缓解 |
|---|---|---|---|
| R1 | 双技术栈分裂：Node(自动化/发布) vs Python(Agent/RAG/分析) | 高 | 已决策：主工程统一 Python，MatrixFlow 仅作参考 |
| R2 | 多库并存无统一模型，ID/表名/列类型异构 | 高 | 先建统一模型+迁移/ETL |
| R3 | 指标口径不一：字符串带"万"、单位不同、列名候选探测 | 高 | 新建 normalizer，淘汰动态列名探测 |
| R4 | 依赖版本：MediaRadar requirements 用 py3.11 但 pycache 是 cpython-38；crawler 依赖不在 requirements.txt | 中高 | 爬虫独立 venv/container |
| R5 | LangGraph 未在 requirements.txt，旧版 import 路径兼容问题 | 中 | 锁定版本或适配新版 API |
| R6 | Qdrant 外部依赖 | 中 | 已决策：Phase1 用 FAISS，接口抽象 |
| R7 | License/合规：MediaCrawler NON-COMMERCIAL，MatrixFlow MIT | 中 | 保留版权头；README 声明；商用需替换爬虫 |
| R8 | 合规/ToS：爬取+发布自动化+反检测 | 中 | 自有账号+少量数据；README 明确合规边界 |
| R9 | 前端重复：Vue3 renderer + Next.js + uni-app 三套 | 中 | 只保留一套 |
| R10 | 账号语义冲突：自有账号 vs 观察账号混用 | 中 | 统一模型用 account_role 字段区分 |
| R11 | MatrixFlow 内部重复目录（browser/ vs core/、scheduler/ vs core/、src/stores/ 废弃） | 低 | 以 AGENTS.md 标注为准 |

### E. 推荐目录结构与决策点

- **决策点**：①自动化语言（已定：全 Python）；②单用户 vs 多用户（已定：单用户）；③RAG 存储（已定：FAISS，保留可换接口）。
- **E 最终目录结构**：见本方案第二节（已在定稿中落盘）。

### F. 分阶段实施计划

- 已并入本方案第六节（P0~P7），并按最新决策修订（P0 地基、P1 数据接入、P2 Agent 内核、P3 账号诊断、P4 Agent 扩展、P5 编排与 MCP、P6 Evaluation、P7 打磨部署）。

---

> 文档版本：v2（决策版）
> 更新说明：基于第一轮分析（附录 A）与第二轮决策定稿，形成最终实施蓝图。
