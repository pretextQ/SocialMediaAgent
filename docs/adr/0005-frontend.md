# ADR-0005: 前端技术选型与接入方式

- 状态：已接受
- 日期：2026-09-13
- 相关阶段：P7（前端，计划见 [`../plan-frontend.md`](../plan-frontend.md)）
- 来源模块（已核验，均为**不采用**判断的引用对象）：
  - `third_party/MatrixFlow-main/electron/main.ts`、`preload.ts`、`ipc/handlers.ts`（Electron 桌面壳与 IPC）
  - `third_party/MatrixFlow-main/electron/platform/<p>/upload|publish`（发布/上传 UI 流程）

## 背景

- 后端 P0 ~ P5.5 完成后，能力已齐（6 个 Agent 端点 + 8 个查询端点 + MCP + CLI），但对外只有**裸 JSON 与 Swagger**，
  「打开就能看」不成立，演示需要手工拼请求。
- [`../plan-frontend.md`](../plan-frontend.md) 已给出前端规划：P0~P8 页面清单、F1~F4 里程碑、技术选型建议与「明确不做」清单。
- 约束（[`../../AGENTS.md`](../../AGENTS.md)）：主要开发只在 `app/` 内；新增重大依赖必须先报告确认；
  第三方能力必须走 ADR 四选一；数据库事实与 LLM 推理必须区分。

## 决策

1. **前端整体「重新实现」**：在 `app/frontend/` 自建单页应用，不移植 MatrixFlow 的 Electron 渲染层。
   （对 `electron/` 各模块的**不采用**判断沿用 [`README.md`](README.md) 三线表结论。）
2. **技术选型 = 重新实现的具体形态**：**Vite + React 18 + TypeScript + Tailwind CSS 4 + Recharts**。
3. **备选方案不采用**：
   - **Jinja2 服务端模板**：不引入 Node 工具链、零前端依赖，但交互与演示体验差，且页面状态（如全局账号选择）要绕回服务端。
   - **Streamlit**：出效果最快，但「不像真前端」，且会在 Python 侧再加一套依赖，与「轻量演示」目标并不更优。
   - **更重方案（Next.js / 状态管理库 / 组件库 / 桌面壳）**：本项目定位是**本地单用户演示工具**，无 SSR / SEO / 多用户 / 跨端需求，属于过度设计。
4. **只读 + Agent 操作为主**：后端无数据写入端点，前端**不做写表单**，只消费查询与 Agent 能力。
5. **来源透明**：每个 Agent 结果必须标注输出来源（`llm` / `rules`），拿不到就显示「来源未知」，**不默认成 LLM**。
   为此后端配套新增 `source` 字段（见「验证方式」）。
6. **接入方式：只经 HTTP**。前端不 import 任何 Python 代码、不直连数据库；开发期用 Vite dev proxy 转发 `/api` 免 CORS。

## 理由

- **与 AGENTS.md 一致**：代码只在 `app/frontend/` 下；不触碰 `third_party/`；不引入 Redis / PostgreSQL 等基础设施。
- **为何不采用 MatrixFlow 渲染层**（源码事实）：
  - 它是 Electron 主进程 + 渲染层 + **IPC** 的强耦合桌面壳，而本项目后端是 HTTP 服务，通路根本不同；
  - 其 UI 直接服务于**发布 / 反检测**流程，而本项目明确不做任何写操作；
  - Node/Electron 与 Python 双技术栈机械移植**无共享代码价值**；三线表已把 `electron/` 系列判为「不采用」。
- **为何选 Vite + React 而非 Jinja2 / Streamlit**：见 [`../plan-frontend.md`](../plan-frontend.md) 第二节的对比表——
  本方案在「可演示、轻量、可扩展」三者间平衡最好，且是被项目自己论证过的方案，未另起炉灶。

## 验证方式

- `npm run build`：`tsc --noEmit`（类型检查，类型逐字段对齐 pydantic 契约）+ `vite build`（928 模块，已做代码分割）。
- `npm test`：**17 项** Vitest 冒烟测试——11 个路由渲染 + 6 个组件（报告渲染 / 评分仪表盘 / 列表空态）。
  目的是「每个路由都能渲染且不抛错」，可在无浏览器环境下提供一条可自动执行的验证命令。
- 端到端：经 Vite dev proxy 实测 `/system/status`、`/reports`、`/reports/{name}` 与 6 个 Agent 端点的 `source` 字段。
- **与计划的偏差（有意）**：[`../plan-frontend.md`](../plan-frontend.md) 第七节「明确不做」包含「前端单元测试框架」。
  本 ADR 仍加入 Vitest，依据是根 `AGENTS.md`「新增功能必须编写对应测试」优先于该设计偏好；
  测试范围刻意保持最小（仅渲染级），偏差记录在 [`../../app/frontend/README.md`](../../app/frontend/README.md)。

## 后果

正面：

- 9 个页面覆盖后端全部对外能力，演示无需手工拼请求；
- 前后端**通过 HTTP 契约解耦**：后端换实现（甚至换语言）不影响前端；
- `plan-frontend.md` 第五节列为「前端依赖」的 3 个后端小改动（`GET /reports`、`GET /system/status`、`source` 字段）已一并落地。

负面 / 风险：

- **引入 Node 工具链**：这是本项目第一处非 Python 依赖（335 个 npm 包 + `package-lock.json`），
  换机时需额外 `npm install`；CI 若要覆盖前端也需引入 Node 环境。
- **前端未接入 CI**：且当前 remote 为 Gitee，`.github/workflows/ci.yml`（GitHub Actions）不会自动触发，前后端测试目前均需人工执行。
- **沿用后端的单用户假设**：前端无鉴权、无多租户（与后端现状一致，见 [`../compliance.md`](../compliance.md) 第 6 节）。

## 参考代码

- 参考但**不采用实现**：`third_party/MatrixFlow-main/electron/main.ts`、`preload.ts`、`ipc/handlers.ts`、
  `electron/platform/<p>/upload|publish`。
- 本项目实现：`app/frontend/` —— `vite.config.ts`（代理/代码分割/Vitest）、`src/api/client.ts`、`src/api/types.ts`、
  `src/App.tsx`（路由表）、`src/layouts/AppLayout.tsx`、`src/components/`、`src/pages/`（9 个页面）、`src/test/`。
- 决策依据：`docs/plan-frontend.md`（选型对比与页面清单）、`docs/api.md`（消费的契约）、`docs/architecture.md` 第 2/3/6 节。
