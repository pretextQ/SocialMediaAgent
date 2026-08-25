# SocialMediaAgent 交接文档（HANDOFF）

> 最后更新：2026-08-25
> 用途：项目将**搁置一段时间**。下次回来（人/AI）先读本文档 + `AGENTS.md` + `docs/architecture-analysis.md`，即可直接继续。
> 当前状态：P0 ~ P5.5 已完成并推送，全量 `pytest` **254 passed**，工作区干净。

---

## 1. 环境状态

- **项目**：多平台自媒体智能运营 Agent（Python 3.12 / FastAPI / SQLAlchemy 2 / LangGraph / RAG+FAISS / Memory）
- **规范**：`AGENTS.md`（工程铁律：只在 `app/` 写代码、third_party 只读、TDD、改动前说明计划、阶段 DoD）
- **Git**：`main` 分支，远程 `https://gitee.com/qiulongfei4408/social-media-agent.git`，HEAD `80a13c2`（已全部推送，工作区干净）
- **核心 venv**：`app/backend/.venv`（含 langgraph / faiss-cpu / openai / apscheduler / mcp / pydantic-settings）
- **crawler venv**：`app/backend/.venv-crawler` 是**空壳**（连 pip 都没有）——阻塞 P1.11/1.12 真机端到端
- **uv**：`C:\Users\zm\AppData\Roaming\Python\Python38\Scripts\uv.exe`（venv 无 pip，装依赖用 uv）
- **测试命令**：`cd app/backend && .venv/Scripts/python.exe -m pytest`（254 passed）

## 2. 项目定位（一句话）

输入平台数据（账号/内容/指标）→ 输出「账号健康诊断 + 内容/选题/标题/运营策略建议」的**自媒体运营决策助手**。分析建议类，不自动发布内容（合规边界）。

## 3. 已完成（P0 ~ P5.5）

| 阶段 | 交付 |
|---|---|
| P0 | 领域模型（Account/Content/Metric/Comment/Topic + enums + `canonical_id`）+ ORM + Normalizer 骨架 + VectorStore/Embedder 接口 + ADR 体系 |
| P1 | MediaCrawler 采集链路（runner 子进程 / reader 显式 schema / schemas）+ Normalizer 完整 + Repository 幂等 upsert + IngestService + FastAPI 查询 + CLI ingest（**真机端到端 P1.11/1.12 阻塞未做**）|
| P2 | LLM Gateway（JSON/pydantic/熔断/重试）+ RAG（FAISS）+ Memory（独立库/TTL/摘要）+ 9 个内部 Tool + LangGraph 最小图 |
| P3 | Account Diagnosis Agent（后被 P5.5.1 合并）|
| P4 | 5 个 Agent + 第 9 个 Tool `get_content_details` + Topic 数据层 + Memory 读-写闭环 + MCP/API |
| P5 | API 文档化（response_model + `docs/api.md`）+ 周报/调度（APScheduler）+ MCP Server（mcp SDK）+ 自有账号 ADR-0004（仅决策）|
| P5.5 | **架构收敛**：Agent 6→3+2、Settings+.env、LLM Gateway 注入、RAG seed、Logging |

## 4. 架构现状

- **分层**：`domain`（纯 Pydantic）/ `models`（ORM）/ `repositories`（幂等 upsert）/ `normalizers` / `connectors`（第三方唯一边界）/ `services` / `agents` / `api` / `rag` / `memory` / `llm`
- **3 个核心 Agent**（`agents/account_strategy|content_analysis|trend_analysis`）：gather→analyze→report（account_strategy 另有 persist 写 Memory）
- **2 个内部能力**（`agents/title_optimization`、`agents/topic_recommendation`：schemas/prompts/nodes，**无 graph.py**，API/MCP/最小图直调）
- **数据链路**：Connector → Normalizer → Unified Domain Model → DB → Tools → Agent，Agent 只经 Tool 取数
- **关键抽象**：`PlatformConnector`（可换官方 API）、`VectorStore`/`Embedder`（FAISS→Qdrant 可换）、`LLMGateway`（OpenAI 兼容 + 熔断/重试 + 规则兜底）、`Memory`（独立库）
- **对外**：HTTP API（6 个 Agent 端点 + 3 个查询端点，见 `docs/api.md`）、MCP Server（7 个工具，stdio）、CLI（`ingest` / `seed-knowledge`）
- **配置**：`config.py`（pydantic-settings 三层回退：默认 < `.env` < env）；`.env.example` 已提交

## 5. 数据输入通道

1. **平台数据（真实主路径，被阻塞）**：`python -m socialmedia_agent.cli.ingest --keyword "AI" --platform bili --limit 5`（需 crawler venv）
2. **程序化写入（当前可用）**：`AccountRepository/ContentRepository/MetricRepository/TopicRepository.upsert(domain_obj)`（测试 fixture 即此路径）
3. **运营知识（可用）**：`python -m socialmedia_agent.cli.seed_knowledge --input seed/knowledge.md` → FAISS 持久化
4. **Memory（自动写入）**：Account Strategy 运行时 `save_operation_memory` 沉淀，无需手动输入
5. **HTTP API 无数据写入端点**（只有查询+分析）

## 6. 未完成清单（下次做什么，按优先级）

### A. 立即做（收尾，~30 分钟）
- [ ] **M6**：`httpx2` 仅 `tests/unit/test_llm_gateway.py` 使用且未声明——替换为 `httpx.MockTransport`（httpx 已是主依赖）或声明为 dev 依赖
- [ ] 补 CI（`.github/workflows/ci.yml` + 本地 `scripts/run_ci.ps1`：pytest 门槛；P6 DoD 要求"CI 强制运行"）
- [ ] 死代码清理：`Comment`（domain+ORM+表，无 repo/API/ingest 使用）、`normalizers/ids.py::canonical_id`（与 `domain/identity` 重复）、`normalizers/rules.py`（no-op）、`circuit_breaker.to_dict()`（无调用者）

### B. AI 真实性（~40 分钟，决定项目能否演示）
- [ ] **P1.11/1.12**：安装 crawler venv 依赖 + `playwright install chromium`（命令见 `app/backend/requirements-crawler.txt`）→ 真实采集一次入库 → P1 DoD 九条验收
- [ ] **真实 LLM 端到端**：`.env` 填 `LLM_API_KEY`（OpenAI 兼容，如 DeepSeek）→ `POST /api/v1/accounts/{id}/strategy` 验证真实调用（链路已接好，只差 key）

### C. AI 内核补强（半天 ~ 1 天）
- [ ] **真实 Tool Calling**：LLM 决策调用内部 Tool（function calling），替换正则路由/固定调用——当前 LangGraph 只是线性壳，无分支/条件路由；这是"真 Agent"的证明点
- [ ] RAG 语义嵌入验证：`SMA_EMBEDDING_MODEL` + 真实 embedding 端点（当前默认 HashEmbedder 非语义）

### D. P5 DoD 未完成项（1~2 天）
- [ ] 自有账号只读适配器 `connectors/matrixflow_ref/`（ADR-0004 已决策：官方能力优先 + Python 重写，发布写操作不做）+ 测试

### E. P6 Evaluation（1~2 天，需先完成 B/C）
- [ ] 5 项评估：数据准确性（DB Ground Truth）/ Tool Calling 正确率 / RAG 检索质量（命中率/NDCG）/ Agent 输出质量（快照回归）/ Prompt 回归
- [ ] `evaluation/` 模块 + CI 强制运行

### F. P7 打磨（1~2 天）
- [ ] docker-compose 部署、README/架构图/演示脚本
- [ ] `docs/compliance.md` 合规声明（License 保留、非商用声明、数据边界）
- [ ] 日志/性能/异常打磨

### G. 技术债（碎片级）
- [ ] MCP/API 的 `list_accounts`/`list_contents` 重复（两处直查 Repository）
- [ ] 平台代号映射两处重复（`connectors/mediacrawler/schemas.py` vs `normalizers/ids.py`）
- [ ] `build_memory_store()` 无 session 生命周期管理
- [ ] `graph_builder.py` 职责膨胀（demo 路由 + Agent 派发 + 硬编码 platform 默认 `"bilibili"`）
- [ ] Alembic 迁移缺失（现用 `create_all`）：决策"补 Alembic"或"明确放弃并记录"
- [ ] Metric「最新快照」语义 vs 时间序列未定（影响趋势/历史分析真实性）

## 7. 已知阻塞 / 问题

- **crawler venv 未装**（用户此前中止过一次安装）→ 阻塞 P1.11/1.12、真机演示
- **LLM 从未真实调用过**（全部 mock/规则兜底）→ 面试/演示前必须跑一次
- **RAG 默认非语义嵌入**（HashEmbedder）→ 检索质量有限
- **LangGraph 无真实编排**（无分支/循环/LLM 决策）→ 架构文档的"P3 起 LLM 决策"未兑现
- **自有账号数据无接入**（ADR-0004 仅决策）
- **合规**：当前采集通道（MediaCrawler 自动化爬虫）违反平台 ToS + 非商用 License；仅限学习/演示，商用必须换官方 API

## 8. 下次继续的推荐步骤

1. **A 收尾**（httpx2 / CI / 死代码）——半小时，清掉审计遗留
2. **B AI 真实性**（crawler venv + 真采集 + 真 LLM 跑通）——项目立刻能演示
3. **C Tool Calling**——把 LangGraph 变成真编排
4. **D 自有账号适配器**（P5 DoD 打勾）
5. **E P6 Evaluation**（依赖 B/C 的数据与链路）
6. **F P7**（部署/README/合规声明）

> 严格遵循 AGENTS.md：每次一个小任务 → 先写测试（TDD）→ 跑测试 → `git diff` → commit + push。

## 9. 常用命令

```bash
# 测试（全量 254）
cd app/backend && .venv/Scripts/python.exe -m pytest

# 单个测试文件
.venv/Scripts/python.exe -m pytest tests/agent/test_account_strategy.py -q

# 采集（需 crawler venv，当前阻塞）
.venv/Scripts/python.exe -m socialmedia_agent.cli.ingest --keyword "AI" --platform bili --limit 5

# 知识库种子（可用）
.venv/Scripts/python.exe -m socialmedia_agent.cli.seed_knowledge --input seed/knowledge.md

# 启动 API
cd app/backend && .venv/Scripts/python.exe -m uvicorn socialmedia_agent.api.main:app --reload

# MCP stdio server
.venv/Scripts/python.exe -m socialmedia_agent.services.mcp_server

# 安装依赖（venv 无 pip，用 uv）
& "C:\Users\zm\AppData\Roaming\Python\Python38\Scripts\uv.exe" pip install --python .venv <pkg>
```

## 10. 关键约定速查（详见 AGENTS.md）

- 只在 `app/` 写代码；`third_party/` 只读
- 新增功能必须写测试；不得声称测试通过而不实际运行
- 修改前说明计划（文件/设计/测试）；架构/数据模型变化需先报告确认
- 阶段不自动前进，DoD 通过才进入下一阶段
- 数据采集必须 `Connector → Normalizer → Unified Domain Model`；Agent 只经 Tool/Service 取数
- 数据库事实与 LLM 推理明确区分；LLM 不编造业务数据
