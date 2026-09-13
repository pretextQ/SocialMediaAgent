# SocialMediaAgent 架构

> 本文描述**架构现状**：分层规则、模块职责、数据流、关键抽象与隔离策略。
> 不包含开发进度（见 [`status.md`](status.md)）、领域模型细节（见 [`data-model.md`](data-model.md)）、
> 第三方源码事实（见 [`source-analysis.md`](source-analysis.md)）、决策记录（见 [`adr/`](adr/)）。

---

## 1. 项目定位

多平台自媒体智能运营 Agent：把平台数据（账号 / 内容 / 指标）转化为**运营决策建议**。

设计边界：

- 只做**分析与建议**，不包含自动发布等写操作。
- 第三方项目只作为数据来源，核心业务代码全部自有。
- **数据库事实与 LLM 推理严格区分**，LLM 不得编造业务数据。

---

## 2. 分层与依赖规则

```
接入层    前端 SPA(app/frontend) | FastAPI / CLI / MCP Server / Scheduler
   |
Agent 层  LangGraph（3 个核心 Agent + 2 个内部能力）+ 9 个内部 Tool
   |
能力层    LLM Gateway  |  RAG（运营知识）  |  Memory（账号历史特征）
   |
服务层    IngestService / WeeklyReport / Scheduler
   |
数据层    Repository -> Domain + Normalizer -> SQLAlchemy / SQLite
   |
边界层    Connector / Adapter（唯一接触第三方）
   |
第三方    third_party/（只读，不 import）
```

依赖规则：

1. 依赖方向**单向**，下层不得反向依赖上层。
2. `domain/` 是纯 Pydantic 契约，不依赖 DB / LLM / 第三方。
3. Agent 只能经 **Tool / Service** 取数，**禁止直接访问数据库**。
4. 第三方能力只能出现在 `connectors/`；其余层禁止 import 第三方项目代码或引用其路径。
5. **RAG 与 Memory 职责分离**：运营知识（通用方法论）与账号历史运营特征（本账号数据）分开存储。
6. **前端只经 HTTP 与后端交互**：`app/frontend/` 不 import 任何 Python 代码、不直连数据库；
   后端无数据写入端点，前端也不做写表单（见 [`plan-frontend.md`](plan-frontend.md)）。

---

## 3. 目录结构

```
app/backend/
├── pyproject.toml
├── .env.example
├── requirements-crawler.txt       # 采集隔离环境依赖（绝不装进核心 venv）
├── seed/                          # 知识库种子 + 手工数据模板（data_template.csv）与说明
├── data/                          # SQLite 运行数据（gitignore）
├── src/socialmedia_agent/
│   ├── config.py                  # pydantic-settings 三层回退
│   ├── logging_config.py
│   ├── domain/                    # 纯领域模型（Pydantic）+ canonical_id
│   ├── models/                    # ORM 映射（domain <-> DB）
│   ├── repositories/              # 数据访问 + 幂等 upsert
│   ├── normalizers/               # 数值 / 时间 / ID 口径归一
│   ├── connectors/                # 第三方唯一边界
│   │   └── mediacrawler/          # adapter / runner / reader / schemas
│   ├── services/                  # ingest / weekly_report / scheduler / mcp_server / mcp_tools
│   ├── llm/                       # gateway / providers / circuit_breaker / factory
│   ├── rag/                       # vector_store / embedder / faiss_store / knowledge / retriever
│   ├── memory/                    # models / store / summarizer（独立库）
│   ├── agents/                    # common / state / graph_builder / tool_loop / tools / 各 Agent
│   ├── api/                       # main（应用工厂）/ deps / routers
│   ├── evaluation/                # 工具选择评测：指标 / runner / case 集
│   └── cli/                       # import_csv / ingest / seed_knowledge
└── tests/                         # unit / integration / agent

app/frontend/                      # 前端 SPA（Vite + React + TS + Tailwind；只经 HTTP 访问后端）
├── vite.config.ts                 # /api dev proxy、代码分割、Vitest 配置
├── src/api/                       # 接口封装（TS 类型逐字段对齐 pydantic 契约）
├── src/components/                # 卡片 / 加载 / 错误 / 空态 / 报告渲染 / 评分仪表盘 / 来源徽标
├── src/context/                   # 全局账号上下文（顶栏选择器）
├── src/layouts/                   # 侧边导航 + 顶栏
├── src/pages/                     # 9 个页面（对应 plan-frontend.md 第三节 P0~P8）
└── src/test/                      # Vitest 冒烟测试
```

---

## 4. 系统架构图

```
+----------------------------- 接入层 -------------------------------+
|  前端 SPA（app/frontend，只经 HTTP 访问）                          |
|  FastAPI /api/v1/*      CLI(ingest, seed)     MCP Server(stdio)    |
|  APScheduler（每周一 09:00 周报；尚未挂到 API 启动流程）            |
+---------------------------------+---------------------------------+
                                  |
+---------------------------------v---------------------------------+
|                        Agent 层 (LangGraph)                       |
|  account_strategy   content_analysis   trend_analysis             |
|  title_optimization  topic_recommendation  （内部能力，无 graph）  |
|-------------------------------------------------------------------|
|  9 个内部 Tool（Agent 取数的唯一通道）                              |
|  get_account_profile / get_recent_contents / get_content_metrics   |
|  get_content_details / analyze_content_performance                 |
|  search_operation_knowledge / get_trend_data                       |
|  get_historical_strategy / save_operation_memory                   |
+----+------------------+-------------------+---------------------+
     |                  |                   |
+----v------+   +-------v--------+   +------v---------+
| LLM       |   | RAG 运营知识    |   | Memory 账号特征 |
| Gateway   |   | VectorStore    |   | 独立 DB + TTL   |
| 重试/熔断  |   | (FAISS 实现)   |   | 读-写闭环       |
| 结构化输出 |   | + Retriever    |   |                 |
+-----------+   +----------------+   +-----------------+
     |
+----v-------------------------------------------------------------+
|              Service 层（编排 / 事务 / 幂等）                       |
|   IngestService   WeeklyReport   Scheduler                        |
+------------------------------+------------------------------------+
                               |
+------------------------------v------------------------------------+
|        Repository + Domain + Normalizer（统一领域模型）             |
|  Account / Content / Metric / Topic                               |
|  Normalizer：12.3万 -> 123000；unix -> ISO；canonical_id 派生       |
|  SQLAlchemy -> SQLite（抽象后可换 PostgreSQL）                      |
+------------------------------+------------------------------------+
                               |
+------------------------------v------------------------------------+
|            Connector / Adapter（唯一接触第三方）                    |
|  MediaCrawlerConnector  ->  runner(隔离 venv 子进程) -> reader      |
|  （未来：官方 API / 自有账号只读适配器，见 ADR-0004）                |
+------------------------------+------------------------------------+
                               |
+------------------------------v------------------------------------+
|  third_party/（只读，不 import）：MatrixFlow-main / MediaRadar-main |
+-------------------------------------------------------------------+
```

---

## 5. 数据流

### 5.1 数据入库链路（两条路径，殊途同归）

自动采集（当前阻塞）：

```
CLI / Scheduler 触发 ingest
  -> MediaCrawlerConnector.search()
     -> runner：隔离 venv 子进程执行爬虫，写入中转发 SQLite
     -> reader：按【显式 schema】读取（禁止动态列名探测）
  -> RawContent -> RawToDomainMapper(Normalizer) -> Repository 幂等 upsert
```

手工导入（可用）：

```
CLI import_csv --input <csv>
  -> 逐行解析 -> RawContent（source=manual）
  -> RawToDomainMapper(Normalizer)，与采集完全同一条链路
  -> Repository 幂等 upsert -> 核心库
```

两条路径**共用** `RawContent -> Normalizer -> Repository`，因此口径归一与幂等语义完全一致；
差异只体现在 `source` 字段（`mediacrawler` / `manual`），保证数据可追溯。
中转发 SQLite 仅作临时中转，不作为业务查询源。

### 5.2 查询与 Agent

```
HTTP / MCP 请求
  -> Agent（LangGraph）
     -> gather：经内部 Tool 取 DB 事实 + 知识 + 历史策略
     -> analyze：LLM Gateway 结构化输出（Pydantic 校验）；失败则规则兜底
     -> persist（仅 account_strategy）：策略摘要写入 Memory
     -> report：确定性渲染 Markdown 报告
  -> 返回 { 结构化结果, report }
```

### 5.3 RAG / Memory

```
RAG  ：写入 = 运营知识文档 --embed--> FAISS；读取 = query -> 向量检索 -> 注入 prompt
Memory：写入 = 每次策略生成后沉淀账号特征；读取 = Agent 启动时注入该账号历史特征
```

两者物理分离：RAG 使用向量库文件，Memory 使用独立 SQLite 库（`SMA_MEMORY_DB_URL`）。

---

## 6. 模块职责

| 模块 | 职责 | 关键约束 |
| --- | --- | --- |
| `domain/` | 纯数据契约（Pydantic），跨层 DTO | 不依赖 DB / LLM / 第三方 |
| `models/` + `repositories/` | ORM 映射与数据访问 | 全部走 Repository，禁止散落 SQL |
| `normalizers/` | 数值（万/亿）、时间、ID、平台口径归一 | 每平台注册规则，`registry` 路由 |
| `connectors/` | 唯一调用第三方；中转库读取；错误/超时处理 | 可整体替换为官方 API |
| `services/ingest` | 采集编排：触发 -> 读取 -> 归一 -> 幂等入库 | 流程可重复执行 |
| `llm/` | 统一 LLM 调用：多提供商、JSON/pydantic、重试、熔断 | Agent 与外部模型的唯一边界 |
| `rag/` | 运营知识：文档管理 + 向量索引 + 检索 | 接口抽象，FAISS 为当前实现 |
| `memory/` | 账号历史运营特征：存储 / 摘要 / TTL | 独立 DB，与 RAG 物理分离 |
| `agents/tools/` | 9 个内部 Tool | Agent 取数的唯一通道 |
| `agents/*` | 各 Agent 的 gather / analyze / report 节点、合成图与指令路由（`agents/router.py`） | 输出契约固定 + 有回归测试；路由保留确定性对照组 |
| `api/` | FastAPI 应用工厂与路由（含只读的 `system_status` / `reports` 端点） | 依赖注入 gateway / retriever |
| `frontend/`（`app/frontend`） | 前端 SPA：9 个页面消费 HTTP API，含报告渲染与来源徽标 | 只经 HTTP，不 import Python；不做写操作 |
| `evaluation/` | 评测：工具选择质量 + RAG 检索质量；指标、runner、case 集 | 用 RecordingRegistry **实测**调用序列；检索评测现场建内存知识库，确定性、无需密钥 |
| `cli/` | 数据导入（`import_csv`）、采集（`ingest`）、知识库种子（`seed_knowledge`） | 支持流程可重复执行 |

---

## 7. 关键抽象与可替换性

| 抽象 | 当前实现 | 可替换为 | 替换成本 |
| --- | --- | --- | --- |
| `PlatformConnector` | `MediaCrawlerConnector` | 平台官方 API、自有账号只读适配器 | 只新增 Connector，业务层不动 |
| `VectorStore` | `FaissVectorStore` | sqlite-vec / Qdrant | 只换实现类 |
| `Embedder` | `HashEmbedder`（非语义）/ `OpenAICompatEmbedder` | 任意语义嵌入服务 | 换实现 + 重新灌库 |
| `LLMProvider` | `OpenAICompatProvider` | 任意 OpenAI 兼容端点 | 改配置即可 |
| Memory 存储 | SQLAlchemy 独立库 | 其他 KV / 关系库 | 只换 `store` 实现 |
| 数据库 | SQLite | PostgreSQL | 通过 SQLAlchemy 抽象，需补迁移工具 |

---

## 8. Agent 层

### 8.1 三个核心 Agent 与两个内部能力

| 名称 | 形态 | 流程 |
| --- | --- | --- |
| `account_strategy` | LangGraph | gather -> analyze -> persist -> report（diagnosis 为其子集）；gather 支持 `agentic=True` |
| `content_analysis` | LangGraph | gather -> analyze -> report |
| `trend_analysis` | LangGraph | gather -> analyze -> report（`topics` 强制以 DB 事实回填） |
| `title_optimization` | 内部能力（无 graph，API/MCP 直调） | gather -> analyze -> render |
| `topic_recommendation` | 内部能力（无 graph，API/MCP 直调） | gather -> analyze -> render（硬去重） |

**工具选择有两种模式**（`build_account_strategy_graph(registry, gateway, agentic=...)`）：

- `agentic=False`（默认）：**确定性 gather**，固定调用 profile / performance / recent / history / trends。
- `agentic=True`：把工具 schema 交给模型，由模型决定调哪些、调几次（`agents/tool_loop.py` 的通用循环）；
  失败或超过最大步数时**自动回退**确定性 gather，绝不产出半份事实。

两种模式都会在 state 中记录 `gather_source`（`llm` / `rules`）与 `tool_trace`（工具调用序列），
供对比与「工具选择正确率」统计使用；`evaluation/` 消费这两个字段产出可复核的数字。

**最小图的指令路由同样有两种模式**（`build_minimal_graph(registry, gateway, agentic=...)`）：

- `agentic=False`（默认）：`agents/router.py` 用正则把指令解析为「目标（Tool 或能力）+ 参数」。
- `agentic=True`：把候选函数（8 个 Tool + 5 个能力 pseudo-tool）的 schema 交给模型做 function calling；
  **异常、未返回唯一函数、参数过不了对应 pydantic schema 一律回退正则**——不执行半份决策。
- 两者都在 state 记录 `route_source`（`llm` / `rules`）与 `route_args`；拓扑为
  `route →（条件分支）exec_tool / no_route → END`。

### 8.2 9 个内部 Tool

| Tool | 数据来源 |
| --- | --- |
| `get_account_profile` | 核心库 |
| `get_recent_contents` | 核心库 |
| `get_content_metrics` | 核心库 |
| `get_content_details` | 核心库 |
| `analyze_content_performance` | 核心库（聚合） |
| `search_operation_knowledge` | RAG |
| `get_trend_data` | 核心库（Topic） |
| `get_historical_strategy` | Memory |
| `save_operation_memory` | Memory（写） |

### 8.3 契约与规则兜底

- 每个 Agent 的输出结构由 **Pydantic 契约**固定，并有回归测试。
- `LLMGateway` 未配置、调用失败或校验失败时，**回退确定性规则**，输出仍满足同一契约。
- DB 事实以 `facts` 显式注入 prompt；prompt 明确约束不得编造。
- 报告由结构化结果**规则渲染**，不依赖 LLM 二次生成（确定性、可测）。

---

## 9. 第三方隔离策略

1. **只读**：`third_party/` 不进主工程 import 路径，禁止修改。
2. **唯一边界**：仅 `connectors/` 与第三方交互；`domain/`、`agents/`、`services/`、`api/` 不得出现第三方 import 或路径引用。
3. **MediaCrawler 隔离**：独立 venv / 独立依赖清单；其中转 SQLite 仅作中转；Adapter 内封装 runner（子进程调度）+ reader（显式 schema）。
4. **可替换性**：`PlatformConnector` 抽象保证未来可换官方 API 而不影响业务层。
5. **MatrixFlow**：仅作源码参考，任何采用都走 ADR 四选一（参考 / Adapter 封装 / 重新实现 / 不采用）。
6. **合规**：见 [`compliance.md`](compliance.md)。
7. **ADR 记录**：每个「是否复用某模块」的决策落在 [`adr/`](adr/)。

---

## 10. 依赖管理

| 环境 | 依赖 | 说明 |
| --- | --- | --- |
| 核心环境 | fastapi, uvicorn, pydantic, pydantic-settings, sqlalchemy, alembic, langgraph, openai, faiss-cpu, numpy, apscheduler, mcp, httpx, tenacity | 由 `pyproject.toml` 管理；dev 额外 pytest |
| 采集隔离环境 | playwright, aiosqlite, asyncmy, redis, pandas, opencv 等 | 见 `requirements-crawler.txt`；**绝不装进核心环境** |
| 密钥 | `.env`（gitignore） | `.env.example` 提交占位；代码不硬编码 |
| 存储 | SQLite（核心库 + Memory 独立库） | 不提前引入 PG / Redis / 向量数据库服务 |

---

## 11. 架构决策索引

| ADR | 主题 | 结论 |
| --- | --- | --- |
| [ADR-0002](adr/0002-llm-gateway.md) | LLM Gateway | 重新实现（借鉴熔断/重试/pydantic 校验思路） |
| [ADR-0003](adr/0003-account-diagnosis.md) | 账号诊断 Agent | 重新实现；P5.5.1 起并入 `account_strategy` |
| [ADR-0004](adr/0004-own-account-data.md) | 自有账号数据接入 | 浏览器自动化不采用；官方能力优先 + Python 重写只读适配器 |
| [ADR-0005](adr/0005-frontend.md) | 前端技术选型与接入方式 | 重新实现：Vite + React + TS + Tailwind SPA（不采用 Jinja2 / Streamlit），只经 HTTP |

第三方模块的逐项「移植候选」预判见 [`adr/README.md`](adr/README.md) 三线表。
