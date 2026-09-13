# SocialMediaAgent 前端

> 依据 [`docs/plan-frontend.md`](../../docs/plan-frontend.md) 实施。
> 技术选型：**Vite + React 18 + TypeScript + Tailwind CSS + Recharts**（该文档第二节论证的方案）。

## 定位

- **演示优先**：把后端已有能力可视化，打开即可看（此前只有裸 JSON / Swagger）。
- **只读 + Agent 操作为主**：后端无数据写入端点，前端不做写表单。
- **诚实呈现 AI**：每个 Agent 结果标注输出来源（`LLM 生成` / `规则兜底`）。

## 快速开始

```powershell
cd app/frontend
npm install
npm run dev            # http://127.0.0.1:5173
```

前端默认把 `/api/v1/*` 代理到 **http://127.0.0.1:8000**（真实数据）。请先启动后端：

```powershell
cd app/backend
.\.venv\Scripts\python.exe -m uvicorn socialmedia_agent.api.main:app --host 127.0.0.1 --port 8000
```

### 对着 demo 库（合成数据，含趋势话题）

```powershell
# 终端 1：demo 后端
cd app/backend
$env:SMA_DB_URL='sqlite:///data/sma_demo.db'
$env:SMA_MEMORY_DB_URL='sqlite:///data/sma_demo_memory.db'
.\.venv\Scripts\python.exe -m uvicorn socialmedia_agent.api.main:app --host 127.0.0.1 --port 8001

# 终端 2：前端指向 demo 后端
cd app/frontend
$env:VITE_API_TARGET='http://127.0.0.1:8001'
npm run dev
```

> 真实公开数据里 `topics=0`，所以「趋势分析」页在 8000 上会是空态；demo 库有 5 个话题。

## 命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器（含 /api 代理） |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 预览生产构建 |
| `npm test` | Vitest 冒烟测试（路由渲染 + markdown 渲染） |

## 目录

```
src/
├── api/          # 后端接口封装（types 与 fetch client，类型对齐 docs/api.md 与 pydantic 契约）
├── components/   # 通用组件（卡片 / 加载 / 错误 / 空态 / 报告渲染 / 评分仪表 / 来源徽标）
├── context/      # 全局账号上下文（顶部账号选择器）
├── hooks/        # useAsync 等
├── layouts/      # 侧边导航 + 顶栏布局
├── pages/        # 9 个页面，与 plan-frontend.md 第三节一一对应
└── test/         # 测试环境 setup
```

## 与计划的偏差（已记录）

`plan-frontend.md` 第七节「明确不做」包含「前端单元测试框架」。
本项目实际加入了 **Vitest + Testing Library** 冒烟测试，原因是根 `AGENTS.md` 明确要求
「新增功能必须编写对应测试」，且 CI 需要一条不依赖人工点页面就能验证前端不崩的命令。
测试范围刻意保持最小：只断言「每个路由都能渲染且不抛错」与「markdown 渲染器输出正确」，
不做交互细节测试。
