# Contributing to MatrixFlow

感谢你对 MatrixFlow 的贡献！

## 行为准则

本项目遵循 [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md)。

## 如何贡献

### 报告 Bug

1. 使用 [Bug Report](https://github.com/matrixflow/matrixflow/issues/new?template=bug_report.yml) 模板
2. 描述预期行为与实际行为的差异
3. 提供复现步骤和环境信息（Electron 版本、macOS/Windows 版本）

### 提交功能请求

1. 使用 [Feature Request](https://github.com/matrixflow/matrixflow/issues/new?template=feature_request.yml) 模板
2. 描述使用场景和预期效果
3. 如果可能，提供设计稿或原型

### 提交代码

1. **Fork** 本仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 遵循编码规范提交更改：`git commit -m 'feat: add amazing feature'`
4. 确保测试通过：`npm test`
5. 推送到分支：`git push origin feature/amazing-feature`
6. 创建 **Pull Request**

## 编码规范

### Commit Message

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 新功能
fix: Bug 修复
docs: 文档更新
style: 代码格式（不影响逻辑）
refactor: 重构
test: 测试
chore: 构建/工具
```

示例：`feat(platform): 添加 Bilibili 平台适配器`

### TypeScript

- 严格模式（strict: true）
- 禁止使用 `as any`、`@ts-ignore`
- 类型定义放在 `types/` 目录

### Vue 3

- 使用 `<script setup lang="ts">` + Composition API
- 组件文件命名：PascalCase（如 `AccountCard.vue`）
- 状态管理使用 Pinia composition-style stores

### IPC 通道

新增 IPC 通道必须：

1. 在 `electron/preload.ts` 注册（白名单）
2. 在 `electron/ipc/handlers.ts` 实现处理器
3. 在 `src/env.d.ts` 声明 `MatrixFlowAPI` 类型
4. 通道命名格式：`{domain}:{action}`（如 `account:list`）

### 测试

- 单元测试：`tests/unit/`
- 集成测试：`tests/integration/`
- E2E 测试：`tests/e2e/`
- 覆盖率阈值：statements/functions/lines ≥ 70%，branches ≥ 60%

## 开发环境

```bash
# 安装依赖
npm install
npx patchright install chrome

# 开发模式
npm run dev

# 运行测试
npm test

# 类型检查
npm run typecheck
```

## 添加新平台适配器

1. 在 `electron/platform/{platform}/` 创建以下文件：
   - `publish.ts` — 发布流程
   - `login.ts` — 登录流程
   - `cookie.ts` — Cookie 提取/验证
   - `selectors.ts` — DOM 选择器
2. 在 `electron/services/PublishService.ts` 注册平台
3. 在 `src/renderer/stores/account.ts` 添加平台选项
4. 编写单元测试和 E2E 测试

## 项目结构

参考 [ARCHITECTURE.md](ARCHITECTURE.md) 了解系统架构。
