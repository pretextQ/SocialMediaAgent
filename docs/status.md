# SocialMediaAgent 项目状态

> 更新：2026-09-12
> 本文是项目**唯一进度来源**：现状、DoD 对照、未完成清单、续作步骤。
> 架构见 [`architecture.md`](architecture.md)；领域模型见 [`data-model.md`](data-model.md)；
> 合规边界见 [`compliance.md`](compliance.md)；工程规范见 [`../AGENTS.md`](../AGENTS.md)。

---

## 1. 一句话现状

后端 **P0 ~ P5.5 已完成并推送**；全量测试 **254 passed**（含 CI 门槛）；
**LLM 链路已于 2026-09-12 用真实端点验证**；前端与 Evaluation 尚未实施。

## 2. 基线

| 项 | 值 |
| --- | --- |
| 分支 / 远程 | `main` / Gitee |
| Python | 3.12（`app/backend/.venv`） |
| 测试 | `.venv/Scripts/python.exe -m pytest` -> 254 passed |
| CI | `.github/workflows/ci.yml`（GitHub Actions）+ `app/scripts/run_ci.ps1`（本地门槛） |
| LLM | 可选；未配置 `LLM_API_KEY` 时全部走确定性规则兜底 |

## 3. 已完成阶段

| 阶段 | 交付 | 备注 |
| --- | --- | --- |
| P0 | 领域模型 + ORM + Normalizer 骨架 + VectorStore/Embedder 接口 + ADR 体系 | 完成 |
| P1 | MediaCrawler 采集链路（runner/reader/显式 schema）+ Normalizer + 幂等 Repository + IngestService + 查询 API + CLI | 完成；**真机验收未做** |
| P2 | LLM Gateway + RAG(FAISS) + Memory(独立库/TTL) + 9 个内部 Tool + LangGraph 最小图 | 完成 |
| P3 | Account Diagnosis Agent | 完成；P5.5.1 起并入 `account_strategy` |
| P4 | 5 个 Agent + Topic 数据层 + Memory 读-写闭环 + MCP/API | 完成 |
| P5 | API 文档化 + 周报/调度 + MCP Server + 自有账号 ADR-0004 | 完成；**适配器未实现** |
| P5.5 | 架构收敛：Agent 6 -> 3+2、Settings + .env、LLM 注入、RAG seed、Logging | 完成 |

## 4. 当前对外能力

- **HTTP**：5 个查询端点 + 6 个 Agent 端点（见 [`api.md`](api.md)）
- **MCP**：7 个工具（stdio）
- **CLI**：`import_csv`（手工导入真实数据，可用）、`ingest`（自动采集，阻塞）、`seed_knowledge`（知识库）

## 5. DoD 对照

### P0 — 全部达成

### P1（9 条）

| # | 条目 | 状态 |
| --- | --- | --- |
| 1 | 至少 1 个平台获取到真实数据 | **部分达成**：自动采集仍阻塞；已提供 `import_csv` 手工导入通道（真实数据，`source=manual` 可审计） |
| 2 | 数据进入采集中转、可审计 | **未达成**（依赖 crawler venv；手工通道不经中转库） |
| 3 | Normalizer 数值/时间/ID 断言通过 | 达成 |
| 4 | 数据进入统一领域模型并落核心库 | 达成 |
| 5 | Account / Content / Metric 可关联查询 | 达成 |
| 6 | canonical_id 可建立跨表关联 | 达成 |
| 7 | FastAPI 可查询 | 达成 |
| 8 | 有对应 unit + integration 测试 | 达成 |
| 9 | 采集流程可重复执行（幂等） | 达成 |

### P2（6 条）— 全部达成

### P3 — 输出 schema / 人类报告 / 统计可核验：达成；P1 真机数据端到端演示：**未达成**

### P4（3 条）— 全部达成（契约 + 回归 + 可组合调用）

### P5 — 调度与周报 / API 文档 / MCP Server：达成；自有账号接入：**未达成**

### P6 / P7 — 未开始

---

## 6. 已验证的真实性（重要）

**2026-09-12 真实 LLM 联调**（DeepSeek `deepseek-flash`，OpenAI 兼容端点）：

- `text` 与 `json + pydantic` 两种模式均通过。
- `POST /accounts/{id}/strategy`、`POST /titles/optimize` 走**真实 LLM**（日志 `llm_analyze: LLM 结构化输出成功`），非规则兜底。
- 输出确实引用数据库事实：2 条内容、话题 `post_count=88`、指标 12000 播放 / 640 赞 / 58 评论均出现在结果中。
- Memory 读-写闭环验证：第二次调用可读到 2 条历史策略。

**验证边界**：

- Agent 端点的真实 LLM 覆盖：`/strategy`、`/contents/{id}/analysis`、`/titles/optimize` 均已验证；`/trends/analysis` 尚未。
- 所用数据为**程序化写入与合成（`synthetic`）的演示数据**，不是真实数据。合成数据由
  `seed/generate_demo_data.py` 生成、以 `--source synthetic` 导入独立 demo 库，
  **仅用于链路验证与演示，不可作为评测依据**。
- 真实数据的导入通道已就绪：`import_csv`（见第 4 节），待填入约 30 条真实数据。

---

## 7. 未完成清单（按优先级）

### A. 收尾

- [x] ~~M6 httpx2~~ —— 已核实为 `openai 3.x` 的**硬传递依赖**，非缺陷，无需处理。
- [x] CI（GitHub Actions + 本地 `run_ci.ps1`）
- [x] 根 README
- [ ] 死代码清理：`Comment`（domain + ORM，无 repo/API/ingest 使用）、`normalizers/ids.py::canonical_id`（与 `domain/identity` 重复）、`normalizers/rules.py`（no-op）、`CircuitBreaker.to_dict()`（无调用者）——**删除文件需先确认** |

### B. AI 真实性

- [x] 真实 LLM 端到端
- [x] 手工数据导入通道：`cli/import_csv.py`（兼容 GBK、`--dry-run`、整体校验、`--source`）+ `seed/` 模板与说明
- [x] 合成演示数据通道：`seed/generate_demo_data.py` → 50 条 → 独立 demo 库（`source=synthetic`），仅用于链路验证与演示
- [ ] P1.11 / 1.12 真机采集（`app/backend/.venv-crawler` 为空壳）
- [ ] 填入约 30 条真实数据（用 `import_csv`），供评测使用

### C. AI 内核补强（当前最大差距）

- [ ] **真实 Tool Calling**：当前 `agents/graph_builder.py` 仍是正则路由 + 固定调用，LangGraph 为线性结构，无分支/条件路由。
- [ ] RAG 语义嵌入：默认 `HashEmbedder` 不具备语义相似度（配置 `SMA_EMBEDDING_MODEL` 可切换）。

### D. P5 DoD 遗留

- [ ] 自有账号只读适配器 `connectors/matrixflow_ref/` + 测试（ADR-0004 已决策，实现待做）

### E. P6 Evaluation（需先完成 C）

- [ ] 5 项评估：数据准确性 / Tool Calling 正确率 / RAG 检索质量 / Agent 输出质量 / Prompt 回归
- [ ] `evaluation/` 模块 + CI 强制运行

### F. P7 打磨

- [ ] docker-compose 部署、架构图与演示脚本
- [x] 合规声明（见 [`compliance.md`](compliance.md)）

### G. 技术债（碎片级）

- [ ] MCP / API 的 `list_accounts` / `list_contents` 重复（两处直查 Repository）
- [ ] 平台代号映射两处重复（`connectors/mediacrawler/schemas.py` vs `normalizers/ids.py`）
- [ ] `build_memory_store()` 无 session 生命周期管理
- [ ] `graph_builder.py` 职责膨胀（正则路由 + Agent 派发 + 硬编码平台默认 `bilibili`）
- [ ] 缺 Alembic 迁移（现用 `Base.metadata.create_all`）
- [ ] Metric「最新快照」语义 vs 时间序列未定（影响趋势/历史分析真实性）
- [x] ~~`data/knowledge/*.index` 未被 `.gitignore` 覆盖~~ —— 已改为忽略整个 `app/backend/data/` 运行产物目录

### H. 前端（规划就绪，未实施）

- [ ] 见 [`plan-frontend.md`](plan-frontend.md)；建议先补后端 3 个小改动（`GET /reports`、`GET /system/status`、响应加 `source: llm|rules`）

---

## 8. 已知阻塞与风险

| 项 | 说明 |
| --- | --- |
| crawler venv 为空壳 | 阻塞自动采集 P1.11/1.12；真实数据改走 `import_csv` 手工导入 |
| RAG 默认非语义 | `HashEmbedder` 检索质量有限 |
| LangGraph 无真实编排 | 无分支 / 循环 / LLM 决策，是「真 Agent」的主要差距 |
| 无认证 / 无多租户 | 当前定位为**单用户本地工具**，不适用于多用户或企业场景 |
| 合规 | 采集通道涉及平台 ToS 与非商用许可，见 [`compliance.md`](compliance.md) |

---

## 9. 推荐续作步骤

1. **C 组 Tool Calling** —— 把正则路由换成 LLM function calling + 条件分支，这是「真 Agent」的证明点。
2. **A 组死代码清理**（需确认删除清单）。
3. **填入真实数据（约 30 条）** —— 用 `import_csv` 手工导入；自动采集可改走官方 API / 自有账号只读适配器（更合规，见 ADR-0004）。
4. **E 组 Evaluation** —— 没有评测的 LLM 系统无法回答「改了 prompt 是变好还是变坏」。
5. **F 组部署与演示**。
6. **H 前端**（可选）。

> 严格遵循 [`AGENTS.md`](../AGENTS.md)：每次一个小任务 -> 先写测试（TDD）-> 跑测试 -> `git diff` -> commit + push。

---

## 10. 常用命令

见根 [`README.md`](../README.md) 的「快速开始」与「测试」两节（环境、配置、启动 API、MCP、CLI、测试命令）。
