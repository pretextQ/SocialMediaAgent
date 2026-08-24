# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| < 0.3.0 | :x:                |

## Reporting a Vulnerability

MatrixFlow 团队非常重视安全。如果你发现安全漏洞，请**不要**公开提交 Issue。

请通过以下渠道私下报告：

- 邮箱：**[待补充]**
- 或使用 GitHub Security Advisory：[https://github.com/matrixflow/matrixflow/security/advisories/new](https://github.com/matrixflow/matrixflow/security/advisories/new)

### 漏洞报告内容

请包含以下信息以便我们快速定位：

1. 受影响的版本号
2. 复现步骤
3. 潜在影响范围
4. 可能的修复建议（可选）

### 响应时间

- 确认收到：**48 小时内**
- 安全修复发布：**30 天内**（严重漏洞优先）

## 安全最佳实践

- 不要将 `.env` 文件提交到仓库
- 所有 API Key 和 Token 通过环境变量注入
- 生产环境使用独立的 Sentry DSN
- Cookie 使用 AES-256-GCM 加密存储
- 渲染进程启用沙箱模式（sandbox: true）

## 已知安全特性

MatrixFlow 内置以下安全机制：

| 特性 | 说明 |
|------|------|
| Cookie 加密 | AES-256-GCM 加密存储，密钥从主密码派生 |
| 账号隔离 | 每个账号独立浏览器上下文，Cookie 互不泄露 |
| 指纹管理 | 浏览器指纹模板库，反检测配置 |
| 签名验证 | 远程选择器 Ed25519 签名验证 |
| 沙箱模式 | 渲染进程 sandbox 启用，IPC 白名单保护 |
| 代理池 | HTTP/SOCKS5 代理管理，按账号绑定 |
