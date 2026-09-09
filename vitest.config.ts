import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// forge 互操作测试依赖兄弟仓库 SCES-User-Wechat 中已修补的 node-forge；
// 独立 CI（无兄弟检出）时跳过并移出覆盖率统计。
const HERE = path.dirname(fileURLToPath(import.meta.url))
const noSibling = process.env.SCES_NO_SIBLING === '1' || !existsSync(path.resolve(HERE, '../SCES-User-Wechat/miniprogram/node_modules/node-forge'))

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        exclude: noSibling ? ['src/crypto/forge-no-dom.test.ts'] : [],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/index.ts',
                'src/crypto/vendor/noble.js',
            ],
            // branches 阈值：0.2.0 移除离线模块后分支覆盖率 79.88%（删除前含 ids/ 全量覆盖），
            // 余量过紧无意义；行/函数/语句仍 ≥85/96/85。CI 以本配置为准。
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 79,
                statements: 80,
            },
        },
    },
})