# shared — 共享层

## 项目概述

三端共享代码（TypeScript 包），**M0 已完成**。加密、数据模型、计算引擎、状态机、校验规则收敛于此，供服务端（server）、管理端（management/desktop）、学生端（user/wechat）复用，避免三端逻辑漂移。

## 文档

| 文档 | 内容 |
|------|------|
| `docs/API.md` | **完整 API 参考**：模块功能、导出签名、参数、返回值、调用示例、平台适配 |
| `README.md` | 快速上手：初始化、最小示例、开发命令 |
| `docs/ARCHITECTURE.md`（根目录） | 系统架构与设计背景 |

## 模块

| 模块 | 职责 |
|------|------|
| `types/` | 数据模型类型（batch/student/apply/revision/score/final_grade/audit_log/dyf-file） |
| `crypto/` | 混合加密（RSA-OAEP + AES-GCM）、SHA-256、base64/utf8，平台适配器模式 |
| `calc/` | 计算引擎（weighted 实现 + formula 预留）、德育分总分、排名 |
| `state/` | 状态机（apply/batch/final，单向推进） |
| `validate/` | 校验规则（学号、冲突、可疑导入、必填） |

## 核心设计约束

1. **纯 TypeScript，无平台依赖**：需同时兼容浏览器（web）、Node（server/management-desktop）、小程序（user-wechat）。平台差异（如 `crypto.subtle` 不可用）由各端通过 `CryptoProvider` 适配器注入，shared 内不引入平台 API。
2. **三端复用**：加密、数据模型、计算引擎、状态机必须从 `shared` 引用，禁止各端重复实现。
3. **命名规范**：见 `docs/ARCHITECTURE.md` §2（`batchId`/`applyId`/`revision` 等）。
4. **测试**：Vitest 单元测试，覆盖计算引擎、状态机、校验规则、加密。

## 使用

- 浏览器 / Node 18+：启动时调用 `useWebCryptoProvider()` 注册默认加密实现。
- 微信小程序：基于 `wx` API 实现 `CryptoProvider` 并 `setCryptoProvider()` 注入。

## 开发命令

```sh
pnpm install
pnpm test          # Vitest 单元测试
pnpm test:coverage # 覆盖率
pnpm type-check    # TypeScript 类型检查
pnpm build         # 输出 dist（ESM + d.ts）
```

## 里程碑

M0 共享层（本包）是最先开发的模块，其他端依赖它。开发前必读 `docs/ARCHITECTURE.md`。