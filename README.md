# SCES-Shared — 三端共享层

学生综合素质测评管理系统（SCES）· 共享层（@sces/shared）：数据模型、加密（.dyf 容器 v2）、计算引擎、状态机、校验规则、离线授权链。

## 消费方（git 依赖 + tag 私包，不发布公开 registry）
- 管理端 SCES-Management-Desktop-Electron：`"@sces/shared": "git+https://github.com/this-is-h/SCES-Shared.git#semver:^0.1.0"`（本地开发 `file:../SCES-Shared`）；
- 微信小程序 SCES-User-Wechat：不走 npm，`scripts/sync-shared.mjs` 源码按 tag 镜像到 `miniprogram/shared/`；
- 契约种子源 SCES-Server 依赖 `@sces/contracts`。

## 打包与分发
纯 TS 源码包（main/types 指向 src/index.ts），消费端各自 bundle；exports 子路径：`.`、`./types`、`./crypto`、`./license`、`./fingerprint`、`./crypto/sign`。
版本打 tag（vX.Y.Z）发布；pnpm-lock 锁定 commit。

## 命令（仓库根）
```sh
pnpm install
pnpm test            # vitest 全量
pnpm test:coverage   # 覆盖率（阈值 ≥80%）
pnpm type-check      # tsc --noEmit
pnpm build           # tsc 声明产物（dist/）
node scripts/build-noble-vendor.mjs   # 重新预打包 noble
```

## 微信镜像注意
`miniprogram/shared/` 镜像排除 Node-only 路径（license/sign/fingerprint），要求 ES2017（无 ?. / ??）。改 shared 源码后，SCES-User-Wechat 运行 `npm run sync:shared` 并提交镜像。

## 在线化方向
服务端（SCES-Server，M5）建成后授权/配置下发改为服务端驱动；shared 的 license/fingerprint/sign 等离线授权链将随模块级下线逐步移除。
