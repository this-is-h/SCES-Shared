# SCES-Shared — 三端共享层

学生综合素质测评管理系统（SCES）· 共享层（`@sces/shared`）：数据模型、加密（.dyf 容器 v2）、计算引擎、状态机、校验规则。

## 开发规范（必读，新会话遵守）

本仓库采用**简化版 Git Flow** 与 **Conventional Commits（约定式提交）**，由 husky 钩子与 CI 强制落地。详情见 `CONTRIBUTING.md`。

### 分支模型
- 长期分支：`main`（生产，仅发布，禁直推）、`develop`（日常开发，默认分支，PR 指向这里）
- 短期分支：`feature/*`、`bugfix/*`、`hotfix/*`、`chore/*`、`release/*`（从 develop 创建，完成 PR 合并回 develop；hotfix 从 main 创建，合并回 main 与 develop）
- 分支名必须以前缀开头（CI 校验）；`main`/`develop` 开启保护（个人账号仓库暂无法强制，需自觉遵守）

### 提交规范（commit-msg 钩子强制）
格式：`<type>(<scope>): <subject>`
- `type` 必填：`feat` `fix` `docs` `style` `refactor` `perf` `test` `chore` `build` `ci` `revert`
- `scope` 可选、小写（本仓：crypto/calc/types/state/validate/import/docs/build/ci/deps）
- `subject` 必填：祈使句、首字母小写、**≤50 字符**、句尾无句号；header ≤72
- 违规提交会被 commitlint 直接拒绝（示例：`feat(crypto): 添加 dyf 容器 v2 分块加密`）

### 提交纪律
- 每提交解决一个问题；单次 ≤300 行；提交前自测（`pnpm type-check` + 相关测试）

### 钩子与 CI 门禁
- `pre-commit`：`pnpm type-check`；`commit-msg`：commitlint
- CI：编译 + 测试（**覆盖率 ≥80%**，v8 thresholds） + 类型 + `pnpm audit`(high 阻断) + gitleaks + 分支名校验
- 发布：develop 成熟 → 合并 main → 打 `vX.Y.Z` tag（git 依赖 + tag 分发，release.yml 自动建 Release）

## 消费方与分发

- 管理端 SCES-Management-Desktop-Electron：git 依赖 `git+https://github.com/this-is-h/SCES-Shared.git#semver:^0.1.0`（0.2.0 发布后切 `^0.2.0`）
- 微信小程序 SCES-User-Wechat：不走 npm，`../SCES-User-Wechat/scripts/sync-shared.mjs` 从本仓源码镜像到 `miniprogram/shared/`
- 纯 TS 源码包（main/types → src/index.ts），消费端各自 bundle

## 模块

| 模块 | 职责 | 微信镜像 |
|------|------|---------|
| `types/` | 数据模型（batch/student/apply/revision/score/dyf/timeline…） | 是 |
| `crypto/` | 混合加密（RSA-OAEP + AES-GCM）、.dyf 容器 v2、noble 预打包 | 是 |
| `calc/` | 德育分计算引擎（dyf-total/rank/weighted/formula） | 是 |
| `state/` | 批次/申请/最终结论状态机 | 是 |
| `validate/` | 校验规则 | 是 |
| `import/` | 导入规范化 | 是 |

## 命令（仓库根）

```sh
pnpm install
pnpm test            # Vitest 全量
pnpm test:coverage   # 覆盖率（阈值 ≥80%）
pnpm type-check      # tsc --noEmit
pnpm build           # 声明产物 dist/
node scripts/gen-test-batch-key.mjs    # 重新生成测试密钥夹具（docs/fixtures/，gitignore）
node scripts/build-noble-vendor.mjs    # 重新预打包 noble（vendored 进 src/crypto/vendor/）
```

## 微信镜像注意

`../SCES-User-Wechat/miniprogram/shared/` 是受控镜像：仅排除测试文件与 Node-only 入口（`crypto/vendor/noble-entry.ts`），要求 ES2017 语法上限（无 `?.`/`??`，用 `src/nullish.ts` 的 `nz`/`opt`）。改本仓源码后需在 SCES-User-Wechat 运行 `npm run sync:shared` 并提交镜像。

## 在线化方向

服务端（SCES-Server / SCES-Server-Vercel）建成后授权/配置/批次/状态下发改为服务端驱动；离线授权链（license/、fingerprint、crypto/sign、ids/offline-batch-id）已随 0.2.0 **移除**，不再维护。.dyf 混合加密（crypto/）保留——服务端不存分数/证明材料，学生数据仍以加密文件为载体。