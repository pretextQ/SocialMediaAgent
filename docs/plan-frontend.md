# SocialMediaAgent 前端规划（plan-frontend）

> 状态：**规划中（未实施）**——本文档为设计稿，动工前需确认
> 参考：`docs/api.md`（现有接口）、`AGENTS.md`（工程约束）、`docs/architecture-analysis.md`
> 定位对齐架构文档："可选轻量前端"（P5 遗留项），目标是**可演示、轻量、真实用**

---

## 一、定位与原则

1. **演示优先**：把后端已有能力可视化，让项目"打开就能看"（当前只有裸 JSON / Swagger）
2. **只读 + Agent 操作为主**：后端无数据写入端点，前端不做写表单（除非后续补 POST 接口，见第五节）
3. **轻量**：单页应用、无鉴权（本地工具）、不做移动端优先、不引入重型状态管理
4. **诚实呈现 AI**：明确标识输出来自「LLM」还是「规则兜底」（呼应 Gateway 设计）

## 二、技术选型

| 项 | 推荐 | 理由 |
|---|---|---|
| 构建 | **Vite + React 18 + TypeScript** | 标准、快、简历友好 |
| 样式 | **Tailwind CSS** | 快速出效果，无需设计系统 |
| 图表 | **Recharts** | 健康度仪表盘/趋势图够用 |
| 请求 | 原生 fetch 封装（可选 TanStack Query） | Agent 调用简单，不需要重状态库 |
| 代理 | Vite dev proxy → `http://127.0.0.1:8000` | 免 CORS |

备选方案（如不想引入 Node 构建）：Jinja2 服务端模板（零依赖但体验差）/ Streamlit（最快但不像"真前端"）。**推荐主选型**。

目录：`app/frontend/`（符合 AGENTS.md"只在 app/ 写代码"；与 `app/backend` 平级）

```
app/frontend/
├── src/
│   ├── api/            # 后端接口封装（types + fetch client）
│   ├── components/     # 通用组件（卡片/加载/空态/报告渲染）
│   ├── pages/          # 页面（见第三节）
│   ├── layouts/        # 侧边导航布局
│   └── main.tsx
└── package.json
```

## 三、信息架构与页面清单

全局布局：左侧固定导航 + 顶部账号选择器（全局上下文：当前操作的账号）

### P0 全局布局 + 工作台 Dashboard `/`
- **目的**：一眼看清"当前账号怎么样 + 能做什么"
- **数据**：`GET /accounts/{id}`、`GET /contents?platform=`、`GET /metrics`
- **内容**：账号信息卡（昵称/平台/owner_type）、关键数字卡（内容数/总播放量）、各能力快捷入口
- **空态**：无账号/无数据时引导去跑 `ingest`（显示命令）

### P1 账号与数据 `/data`
- 账号列表（平台过滤）、内容列表、指标明细（按 content_id 过滤）
- **数据**：三个查询端点
- 交互：表格 + 平台筛选下拉；点内容跳转内容分析

### P2 账号诊断与策略 `/strategy`（核心演示页）
- 选择账号 → 点「开始分析」→ 渲染报告
- **数据**：`POST /accounts/{id}/strategy`
- 展示：健康度仪表盘（0-100）、优势/不足/异常/建议 四象限列表、周计划/KPI/风险 卡片、「已沉淀到 Memory」标记、markdown 报告原文折叠
- 交互：按钮 loading（Agent 调用可能数秒）；显示输出来源标识（LLM/规则兜底，见第五节）

### P3 内容分析 `/analysis/:contentId`
- 从数据页进入或输入 content_id → 质量分 + 优势/不足/建议
- **数据**：`POST /contents/{id}/analysis`

### P4 趋势分析 `/trends`
- 平台选择 + 周期滑杆（1~90 天）→ 话题热度表（keyword/post_count 排序）+ 趋势分 + 洞察
- **数据**：`POST /trends/analysis`
- 空态提示：「该周期无趋势话题」→ 引导 Topic 数据从哪来（当前无采集链路，见第六节依赖）

### P5 选题推荐 `/topics`
- 选账号 → 推荐选题列表（标题 + rationale + estimated_interest 进度条），高亮「来自趋势」「来自知识库」
- **数据**：`POST /accounts/{id}/topic-recommendation`

### P6 标题优化 `/titles`
- 双模式输入：选已有内容 或 直接粘贴标题 → 3 条优化标题（一键复制）+ 说明
- **数据**：`POST /titles/optimize`

### P7 周报 `/reports`
- 周报列表 + markdown 渲染查看
- **依赖后端新增**：`GET /api/v1/reports`（读取周报文件目录，见第五节）

### P8 系统状态 `/settings`
- 只读状态卡：LLM 是否配置（有 Key=AI 模式）、知识库条数、Memory 条数、DB 路径
- **依赖后端新增**：`GET /api/v1/system/status`（聚合只读信息）

## 四、全局交互规范

1. **Loading**：Agent 端点是同步长请求（LLM 数秒），统一按钮 spinner + 骨架屏；防重复提交
2. **错误**：404（账号/内容不存在）→ 行内提示；网络错误 → toast；所有错误可重试
3. **来源透明**：每个 Agent 结果标注「LLM 生成」/「规则兜底」（依赖后端加字段，见第五节）
4. **空态**：每个列表页有空态插画/文案 + 下一步动作指引
5. **报告渲染**：后端返回的 markdown 报告统一用同一渲染组件

## 五、后端配套小改动（前端依赖，均小）

| 改动 | 目的 | 规模 |
|---|---|---|
| `GET /api/v1/reports`（列周报文件 + 读单篇） | P7 周报页 | 小 |
| `GET /api/v1/system/status` | P8 状态页 | 小 |
| Agent 响应加 `source: "llm"\|"rules"` 字段 | 来源透明标识 | 小（nodes.analyze 返回时带上）|
| （可选）`POST /api/v1/accounts|contents|metrics` 手动录入 | 让前端能补自有数据 | 中，涉及校验，建议放后 |

## 六、里程碑与 DoD

| 阶段 | 内容 | DoD |
|---|---|---|
| **F1 脚手架** | Vite 项目 + Tailwind + 布局导航 + api client 类型封装 + Dashboard 骨架 | `npm run dev` 可开，导航可达全部路由 |
| **F2 核心演示页** | P2 诊断策略 + P6 标题优化 + P3 内容分析 | 三页真实调通后端，loading/错误/空态齐全 |
| **F3 数据与辅助** | P1 数据页 + P4 趋势 + P5 选题 + P8 状态 | 全部端点被 UI 覆盖 |
| **F4 收尾** | P7 周报（含后端 reports 接口）+ 来源标识 + README 截图 | 演示脚本：采集→分析→策略→选题→标题 全流程可点 |

**前端 DoD**：不引入鉴权/SSR/测试框架之外的重依赖；核心流程（F2）截图可放进 README。

## 七、明确不做

- 登录/多用户/权限（本地工具定位）
- 移动端优先适配（桌面演示为主）
- 复杂可视化大屏（Recharts 够用）
- 前端单元测试框架（以手动演示为准；若后续要可加 Vitest）

---

> 动工顺序建议：先确认本规划 → F1 脚手架 → F2 核心三页（配合真实 LLM/数据跑通最有演示价值）。
