import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// 离线授权链测试（src/license/**）与 forge 互操作测试依赖兄弟仓库的契约种子/已修补 node-forge。
// 独立 CI（无兄弟检出）时跳过并移出覆盖率统计。
const HERE = path.dirname(fileURLToPath(import.meta.url))
const noSibling = process.env.SCES_NO_SIBLING === '1' || !existsSync(path.resolve(HERE, '../SCES-Server/contracts/seed'))

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        exclude: noSibling
            ? ['src/license/**', 'src/crypto/forge-no-dom.test.ts']
            : [],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/index.ts',
                'src/crypto/vendor/noble.js',
                ...(noSibling ? ['src/license/**'] : []),
            ],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
})