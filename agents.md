# SCES-Shared — Agents — Agents

本目录的 Claude Code 子代理定义位于根目录 `.claude/agents/`（Claude Code 实际加载的位置）。

## 可用代理

| 代理 | 用途 |
|------|------|
| `shared-dev` | 共享层开发（types/crypto/calc/state/validate） |
| `shared-review` | 共享层审查（平台兼容性、三端复用、测试覆盖） |
| `architect` | 架构评审（数据模型、命名规范、状态机一致性） |

## 使用方式

在 shared 目录下工作时，Claude Code 会按 `shared/CLAUDE.md` 加载上下文。需要专项代理时调用对应代理。

## 当前重点

- 共享层未创建，是**最先开发**的模块（M0），其他端依赖它。
- 约束：纯 TypeScript、无平台依赖、三端复用。
- 开发前必读 `docs/ARCHITECTURE.md`。