# SocialMediaAgent

多平台自媒体智能运营 Agent —— 输入平台账号 / 内容 / 指标数据，输出**账号诊断、内容分析、趋势分析、选题推荐、标题优化、运营策略**。

> **状态**：后端可用（P0 ~ P5.5 已完成）。前端与 Evaluation 尚未实施。
> 当前进度、未完成清单与续作步骤见 [`docs/status.md`](docs/status.md)。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| Web | FastAPI + Uvicorn |
| 数据 | SQLAlchemy 2.0 + SQLite（抽象后可换 PostgreSQL） |
| Agent | LangGraph |
| LLM | OpenAI 兼容端点（如 DeepSeek）+ 重试 / 熔断 / 结构化输出 |
| RAG | FAISS + `VectorStore` / `Embedder` 抽象（可换 Qdrant / sqlite-vec） |
| Memory | 独立 SQLite 库（与 RAG 物理分离）+ TTL |
| MCP | `mcp` SDK（stdio） |
| 调度 | APScheduler（每周一 09:00 生成周报） |
| 测试 | pytest |

---

## 快速开始

### 0. 环境要求

- Python **3.12+**（`requires-python = ">=3.12"`）

> 注意：**始终使用 `app/backend/.venv` 里的解释器**（`.venv/Scripts/python.exe`）。
> 系统 PATH 上的 `python` 可能是 3.8，不满足版本要求。

### 1. 安装依赖

```powershell
cd app/backend

# 1) 确认解释器为 3.12+（本项目 requires-python >= 3.12）
python --version

# 2) 创建虚拟环境（<PY312> 换成你的 3.12 解释器）
<PY312> -m venv .venv

# 3) 安装依赖（含 dev：pytest）
.venv/Scripts/python.exe -m pip install -e ".[dev]"
```

> **本机说明（Windows / 当前开发机）**
>
> - 本机 `python` 是 **3.8**，`py` 启动器也未注册 3.12；本机 3.12 解释器由 uv 管理，位于
>   `$env:APPDATA/uv/python/cpython-3.12-windows-x86_64-none/python.exe`
> - 现有 `app/backend/.venv` 由 uv 创建、**不包含 pip**，对它执行 `python -m pip` 会报 `No module named pip`。
>   需要给它装包时改用 uv（**uv 不在 PATH 上**）：
>
>   ```powershell
>   & "$env:APPDATA/Python/Python38/Scripts/uv.exe" pip install --python .venv <package>
>   ```

### 2. 配置

```powershell
cd app/backend
copy .env.example .env
```

在 `.env` 中填写 LLM 配置（**可选**）：

```ini
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-flash
LLM_TIMEOUT=60
```

**不填也能完整运行**：未配置 `LLM_API_KEY` 时所有 Agent 自动走**确定性规则兜底**，无需密钥即可演示。

> `.env` 已被 `.gitignore` 忽略，**绝不要提交密钥**。新增配置项时请同步更新 `.env.example` 与 `config.py`。

### 3. 灌入运营知识库（可选，RAG）

```powershell
.venv/Scripts/python.exe -m socialmedia_agent.cli.seed_knowledge --input seed/knowledge.md
```

未灌库时知识库为空，`search_operation_knowledge` 返回空列表，不影响其他能力。

### 4. 启动 API

```powershell
cd app/backend
.venv/Scripts/python.exe -m uvicorn socialmedia_agent.api.main:app --reload
```

- Swagger UI：http://127.0.0.1:8000/docs
- OpenAPI：http://127.0.0.1:8000/openapi.json

### 5. 以 MCP Server 方式暴露能力（stdio）

```powershell
.venv/Scripts/python.exe -m socialmedia_agent.services.mcp_server
```

注册 7 个工具：`account_strategy`、`analyze_content`、`analyze_trends`、`recommend_topics`、`optimize_title`、`list_accounts`、`list_contents`。

### 6. 采集平台数据（当前**阻塞**）

```powershell
.venv/Scripts/python.exe -m socialmedia_agent.cli.ingest --keyword "AI" --platform bili --limit 5
```

该命令需要 `app/backend/.venv-crawler` 按 `requirements-crawler.txt` 装好依赖并执行 `playwright install chromium`；
当前该 venv 为空壳，**真机采集尚未跑通**。在它可用之前，可用 Repository 程序化写入数据：

```python
from socialmedia_agent.database.session import Database
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.enums import Platform

db = Database()
db.create_all()
with db.session() as session:
    AccountRepository(session).upsert(Account(platform=Platform.BILIBILI, platform_id="90001", nickname="示例账号"))
```

---

## 测试

```powershell
cd app/backend
.venv/Scripts/python.exe -m pytest              # 全量
.venv/Scripts/python.exe -m pytest tests/agent -q   # 只跑 Agent
```

或使用本地 CI 门槛脚本（与 CI 执行同一条命令，退出码透传）：

```powershell
pwsh app/scripts/run_ci.ps1
```

CI 配置见 `.github/workflows/ci.yml`（Python 3.12 + 全量 pytest）。

> **注意**：本仓库当前 remote 为 Gitee，`.github/workflows/ci.yml` 不会在 Gitee 上自动执行；
> 推送到 GitHub 即生效，或按需接入 Gitee Go。

---

## 目录结构

```
SocialMediaAgent/
├── app/
│   ├── backend/
│   │   ├── pyproject.toml            # 依赖与 pytest 配置
│   │   ├── .env.example              # 配置模板（.env 不提交）
│   │   ├── requirements-crawler.txt  # 采集隔离环境依赖（绝不装进核心 venv）
│   │   ├── seed/knowledge.md         # 运营知识库种子
│   │   ├── src/socialmedia_agent/
│   │   │   ├── config.py             # pydantic-settings 三层回退（默认 < .env < 环境变量）
│   │   │   ├── domain/               # 纯 Pydantic 领域模型 + canonical_id 规则
│   │   │   ├── models/               # SQLAlchemy ORM 映射
│   │   │   ├── repositories/         # 幂等 upsert（canonical_id / 快照语义）
│   │   │   ├── normalizers/          # 数值(12.3万)/时间/ID 口径归一
│   │   │   ├── connectors/           # 第三方唯一边界（MediaCrawler adapter/runner/reader）
│   │   │   ├── services/             # ingest / mcp_server / scheduler / weekly_report
│   │   │   ├── llm/                  # LLMGateway（结构化输出 + 重试 + 熔断）+ factory
│   │   │   ├── rag/                  # VectorStore / Embedder 抽象 + FAISS + Retriever
│   │   │   ├── memory/               # 账号历史运营特征（独立库 + TTL + 摘要）
│   │   │   ├── agents/               # 3 个 Agent + 2 个内部能力 + 9 个内部 Tool
│   │   │   ├── api/                  # FastAPI 应用工厂 + 路由
│   │   │   └── cli/                  # ingest / seed_knowledge
│   │   └── tests/                    # unit / integration / agent
│   └── scripts/run_ci.ps1            # 本地 CI 门槛
├── docs/                             # 架构、ADR、API、计划、交接文档
└── third_party/                      # 第三方源码（只读，不 import）
```

---

## HTTP API

全部端点前缀 `/api/v1`。数据查询为只读；写入走 CLI 或 Repository。

### 数据查询

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/accounts` | 账号列表（可按 `platform` 过滤） |
| GET | `/accounts/{account_id}` | 账号详情 |
| GET | `/contents` | 内容列表（可按 `platform` 过滤） |
| GET | `/contents/{content_id}` | 内容详情 |
| GET | `/metrics` | 指标列表（可按 `content_id` / `metric_type` 过滤） |

### Agent 能力

| 方法 | 路径 | 返回 |
| --- | --- | --- |
| POST | `/accounts/{account_id}/diagnosis` | 账号健康诊断（子集契约） |
| POST | `/accounts/{account_id}/strategy` | 诊断 + 运营策略（含周计划 / KPI / 风险），并写入 Memory |
| POST | `/contents/{content_id}/analysis` | 单条内容质量分析 |
| POST | `/trends/analysis` | 平台周期趋势分析（body: `platform`, `period`） |
| POST | `/accounts/{account_id}/topic-recommendation` | 选题推荐（与已有内容去重） |
| POST | `/titles/optimize` | 标题优化（body: `content_id` 或 `title`，固定返回 3 条） |

所有 Agent 端点返回 `{ 结构化的结果, report }`，`report` 为确定性渲染的 Markdown 人类可读报告。
完整契约见 [`docs/api.md`](docs/api.md)。

---

## 架构与数据流

依赖方向严格单向：

```
接入层(API/CLI/MCP/Scheduler)
  → Agent 层(LangGraph)
  → Tool / Service / Repository / LLM / RAG / Memory
  → Connector / Adapter（唯一接触第三方的边界）
  → third_party（只读，不 import）
```

采集链路：

```
Connector → Normalizer → Unified Domain Model → 核心库 → Tool → Agent
```

Agent 只经 **Tool** 取数，不直接访问数据库、也不依赖第三方内部实现。

### 三个核心 Agent 与两个内部能力

| 名称 | 形态 | 说明 |
| --- | --- | --- |
| `account_strategy` | LangGraph（gather → analyze → persist → report） | 账号诊断 + 运营策略，`persist` 写入 Memory 形成读-写闭环 |
| `content_analysis` | LangGraph（gather → analyze → report） | 单条内容质量分析 |
| `trend_analysis` | LangGraph（gather → analyze → report） | 平台趋势分析，`topics` 强制以 DB 事实回填 |
| `title_optimization` | 内部能力（无 graph） | 固定 3 条标题，API / MCP 直调 |
| `topic_recommendation` | 内部能力（无 graph） | 趋势候选 + 知识库兜底 + 已有内容去重 |

### 9 个内部 Tool

`get_account_profile`、`get_recent_contents`、`get_content_metrics`、`get_content_details`、`analyze_content_performance`、`search_operation_knowledge`、`get_trend_data`、`get_historical_strategy`、`save_operation_memory`。

---

## 设计要点

1. **数据库事实与 LLM 推理分离**：DB 事实以 `facts` 显式注入 prompt，prompt 明确约束不得编造；趋势话题等字段一律用 DB 结果回填覆盖 LLM 输出。
2. **规则兜底**：`gateway=None` 或 LLM 调用 / 校验失败时，退回确定性规则，保证无密钥也可演示、且输出满足同一套 Pydantic 契约。
3. **RAG 与 Memory 职责分离**：RAG 存运营知识（可检索的通用方法论），Memory 存账号历史运营特征（独立 DB + TTL），二者物理分离。
4. **第三方隔离**：`connectors/` 是唯一接触第三方的边界；读取采集中转库使用**显式 schema 映射**，禁止动态列名探测。
5. **接口可替换**：`PlatformConnector`、`VectorStore`、`Embedder`、`LLMProvider` 均为抽象接口，便于替换实现而不动业务层。
6. **契约固定**：每个 Agent 的输出结构由 Pydantic 契约约束并有回归测试，Agent 响应自带人类可读 `report`。
7. **决策留痕**：每个「是否复用第三方模块」的决策都记录在 `docs/adr/`（参考 / Adapter 封装 / 重新实现 / 不采用）。

---

## 已知限制

- **LangGraph 尚未实现 LLM 工具决策**：当前 `agents/graph_builder.py` 使用确定性正则路由 + 固定调用，图是线性结构，没有分支或 function calling。这是当前与「真正的 Agent」差距最大的地方。
- **RAG 默认非语义**：未配置 `SMA_EMBEDDING_MODEL` 时使用 `HashEmbedder`（确定性字符哈希，不具备语义相似度）。
- **真实采集链路阻塞**：`.venv-crawler` 为空壳，`ingest` 尚未真机跑通；现有数据均来自程序化写入。
- **无数据库迁移**：使用 `Base.metadata.create_all`，未接 Alembic；表结构变更需自行处理。
- **前端、Evaluation 未实施**：`docs/plan-frontend.md` 已规划；P6 评估套件尚未开发。
- **周报接口未暴露**：周报由 APScheduler 落盘为 Markdown，尚无 HTTP 读取接口。

> 已完成能力的真实性：LLM 链路已于 2026-09-12 用 DeepSeek `deepseek-flash` 真实调用验证（`/strategy`、`/titles/optimize`），
> 输出确实引用了数据库中的指标与话题事实。

---

## 合规声明

- MediaCrawler（源码位于 `third_party/MediaRadar-main/backend/services/crawler_service/`）采用 **NON-COMMERCIAL LEARNING LICENSE**，本项目仅在 `third_party/` 内以只读方式引用，未修改其源码。
- 数据采集依赖浏览器自动化，可能触及目标平台的服务条款；**本项目仅用于学习与技术演示，商用必须替换为平台官方 API**。
- 分析能力仅输出建议，**不包含自动发布等写操作**。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/README.md`](docs/README.md) | **文档索引与阅读顺序（先看这个）** |
| [`docs/architecture.md`](docs/architecture.md) | 架构：分层、模块职责、数据流、关键抽象 |
| [`docs/data-model.md`](docs/data-model.md) | 领域模型、`canonical_id`、表结构与幂等键 |
| [`docs/api.md`](docs/api.md) | HTTP API 清单与输出契约 |
| [`docs/status.md`](docs/status.md) | 项目进度、DoD 对照、未完成清单、续作步骤 |
| [`docs/adr/`](docs/adr/) | 架构决策记录与「移植候选」三线表 |
| [`docs/source-analysis.md`](docs/source-analysis.md) | 第三方源码分析（MatrixFlow / MediaCrawler） |
| [`docs/compliance.md`](docs/compliance.md) | License / 平台 ToS / 个人信息边界 |
| [`docs/plan-frontend.md`](docs/plan-frontend.md) | 前端规划（未实施） |
| [`AGENTS.md`](AGENTS.md) | 工程规范（开发前必读） |
