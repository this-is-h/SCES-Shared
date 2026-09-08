# 贡献指南（SCES-Shared）

采用简化版 Git Flow 与 Conventional Commits（约定式提交），由钩子与 CI 强制落地。

## 分支模型
| 分支 | 生命周期 | 用途 |
|---|---|---|
| main | 永久 | 生产分支，仅发布稳定版；禁直推，只接受 develop→main 发布合并 |
| develop | 永久 | 日常开发主分支（默认分支），PR 指向这里 |
| feature/* / bugfix/* / chore/* | 短期 | 从 develop 创建，完成 PR 合并回 develop |
| hotfix/* | 短期 | 从 main 创建，完成合并回 main 与 develop |

分支名须符合前缀（CI 拒违规）；develop/main 开保护（强制 PR + 状态检查；main 禁直推）。

## 提交规范（commit-msg 强制）
格式 `<type>(<scope>): <subject>`；type ∈ feat/fix/docs/style/refactor/perf/test/chore/build/ci/revert；
scope 小写（crypto/calc/types/state/validate/ids/import/license/fingerprint/docs/build/ci/deps）；
subject ≤50 字符、小写、祈使句。纪律：每提交单一问题；单次 ≤300 行；提交前 type-check + 相关测试。

## 钩子与 CI 门禁
- pre-commit：`pnpm type-check`；commit-msg：commitlint。
- CI：编译 + 测试（覆盖率 ≥80%）+ 类型 + audit(high) + gitleaks + 分支名。

## 发布流程
1. develop 成熟 → 合并 main 打 vX.Y.Z tag；
2. tag 触发 release.yml：编译 + 覆盖率门禁后建 GitHub Release；
3. 消费方经 git 依赖 `#semver:^X.Y.Z` 引用，lockfile 锁 commit。
