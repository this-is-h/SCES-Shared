# SCES-Shared — 三端共享层

学生综合素质测评管理系统（SCES）· 共享层（@sces/shared）：数据模型、加密（.dyf 容器 v2）、计算引擎、状态机、校验规则。

## 消费方（源码分发，不发布公开 registry）
- 管理端 SCES-Management-Desktop-Electron：git 依赖，当前由消费仓 `package.json` 固定提交，lockfile 锁定解析结果；升级须显式更新并运行消费端回归。
- 微信小程序 SCES-User-Wechat：通过 `scripts/sync-shared.mjs` 从同级源码目录或 `DMS_SHARED_SRC` 指定路径镜像到 `miniprogram/shared/`；脚本不会自行拉取 tag。
- 契约种子来自 SCES-Server；共享层的种子对齐测试在本地存在同级契约种子时执行。

## 打包与分发
纯 TS 源码包（main/types 指向 src/index.ts），消费端各自 bundle；exports 子路径：`.`、`./types`、`./crypto`。
版本打 tag（vX.Y.Z）发布；pnpm-lock 锁定 commit。

## 命令（仓库根）
```sh
pnpm install
pnpm test            # vitest 全量
pnpm test:coverage   # 行/语句/函数 ≥80%，分支 ≥79%
pnpm test:ci         # SCES_NO_SIBLING=1 的跨平台覆盖率检查
pnpm type-check      # tsc --noEmit
pnpm build           # tsc 声明产物（dist/）
node scripts/build-noble-vendor.mjs   # 重新预打包 noble
```

## 微信镜像注意
`miniprogram/shared/` 镜像仅排除测试文件与 Node-only 入口（`crypto/vendor/noble-entry.ts`），要求 ES2017（无 ?. / ??）。改 shared 源码后，SCES-User-Wechat 运行 `npm run sync:shared` 并提交镜像。

## 测试边界

阈值以 [vitest.config.ts](vitest.config.ts) 为准。`forge-no-dom.test.ts` 需要同级微信仓已安装并修补的 node-forge；缺少该依赖或设置 `SCES_NO_SIBLING=1` 时不运行。独立 CI 的通过不能代替微信无 DOM 环境的互操作测试。

## 在线协议边界

授权、配置、批次和状态由服务端驱动；shared 的离线授权链（license/fingerprint/sign/offline-batch-id）已随 0.2.0 移除，不再维护。`.dyf` 混合加密保留，学生身份与材料仍通过本地加密文件交接；服务端只接收契约允许的状态、总分快照及限时加密授权包。

预览门户 SCES-Web-Vercel 的 `.dyf` v6 是独立格式，不能仅凭文件扩展名认定与本仓 v2 容器兼容。贡献及发布规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。
