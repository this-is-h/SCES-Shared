#!/usr/bin/env node
/**
 * CI 等价测试门禁（跨平台）：以 `SCES_NO_SIBLING=1` 运行 vitest + coverage。
 *
 * 独立 CI（无 SCES-Server / SCES-User-Wechat 兄弟检出）与本地开发环境不同：
 * - forge 互操作测试被排除（依赖兄弟仓修补版 node-forge）；
 * - 契约种子对齐套件在兄弟仓种子缺失时跳过。
 * 每次 push 前除 `pnpm test` 外应跑本脚本，确保独立环境门禁通过。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const vitestBin = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')

const result = spawnSync(process.execPath, [vitestBin, 'run', '--coverage'], {
    cwd: ROOT,
    env: { ...process.env, SCES_NO_SIBLING: '1' },
    stdio: 'inherit',
})
process.exit(result.status === null ? 1 : result.status)
