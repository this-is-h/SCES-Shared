# 贡献指南（SCES-Shared）

采用简化版 Git Flow 与 Conventional Commits（约定式提交），由钩子与 CI 强制落地。

## 分支模型
| 分支 | 生命周期 | 用途 |
|---|---|---|
| main | 永久 | 生产分支，仅发布稳定版；禁直推，只接受 develop→main 发布合并 |
| develop | 永久 | 日常开发主分支（默认分支），PR 指向这里 |
| feature/* / bugfix/* / chore/* | 短期 | 从 develop 创建，完成 PR 合并回 develop |
| hotfix/* | 短期 | 从 main 创建，完成合并回 main 与 develop |

CI 校验 PR 源分支和 push 当前分支；develop/main 的保护规则需仓库管理员配置（强制 PR + 必需状态检查；main 禁直推），不由 workflow 自动开启。

## 提交规范（commit-msg 强制）
格式 `<type>(<scope>): <subject>`；type ∈ feat/fix/docs/style/refactor/perf/test/chore/build/ci/revert；
scope 小写（crypto/calc/types/state/validate/import/docs/build/ci/deps）；
subject ≤50 字符、小写、祈使句。纪律：每提交单一问题；单次 ≤300 行；提交前 type-check + 相关测试。

## 钩子与 CI 门禁
- pre-commit：`pnpm type-check`；commit-msg：commitlint。
- CI：`pnpm build` + `pnpm test:coverage`（`SCES_NO_SIBLING=1`）+ `pnpm type-check` + `pnpm audit --prod --audit-level high` + gitleaks + 分支名。
- 覆盖率阈值为行/语句/函数 ≥80%、分支 ≥79%，以 `vitest.config.ts` 为准；本地可执行 `pnpm test:ci`。微信 forge 互操作测试另需同级仓依赖，见 [README](README.md)。

## 发布流程
1. develop 成熟 → 合并 main 打 vX.Y.Z tag；
2. tag 触发 release.yml：编译 + 覆盖率门禁后建 GitHub Release；
3. 消费方通过 git ref 和 lockfile 固定版本，当前桌面端直接固定 commit；微信端需同步源码镜像。发布 shared 不会自动升级消费仓。
