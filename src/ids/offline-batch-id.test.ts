import { beforeAll, describe, expect, it } from 'vitest'
import { useWebCryptoProvider } from '../crypto/webcrypto'
import { OFFLINE_BATCH_ID_PREFIX, deriveOfflineBatchId, offlineBatchIdSeed } from './offline-batch-id'

const BASE = { unitId: 'nxuLx', year: 2025, semester: 2, isTest: false, seq: 1 }

beforeAll(() => {
    useWebCryptoProvider()
})

describe('offlineBatchIdSeed', () => {
    it('种子串形状固定（改动它等同于不兼容升级）', () => {
        expect(offlineBatchIdSeed(BASE)).toBe(`${OFFLINE_BATCH_ID_PREFIX}:nxuLx:2025:2:f:1`)
    })

    it('isTest 用 t/f 单字符区分', () => {
        expect(offlineBatchIdSeed({ ...BASE, isTest: true })).toBe(
            `${OFFLINE_BATCH_ID_PREFIX}:nxuLx:2025:2:t:1`,
        )
    })
})

describe('deriveOfflineBatchId', () => {
    it('确定性：同输入两次调用结果相同', async () => {
        const [a, b] = await Promise.all([deriveOfflineBatchId(BASE), deriveOfflineBatchId(BASE)])
        expect(a).toBe(b)
    })

    it('固定输入产出固定 id（回归锁定：两端与构建脚本必须一致）', async () => {
        // 该值由 dual-mode/poc/feasibility.mjs 断言 10 产出并已写入方案文档
        expect(await deriveOfflineBatchId(BASE)).toBe('293604ab-e65a-82e4-b349-7b43f1adee39')
    })

    it('UUID 形态：8-4-4-4-12 hex，version=8，variant=10', async () => {
        const id = await deriveOfflineBatchId(BASE)
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
        expect(id[14]).toBe('8')
        expect(['8', '9', 'a', 'b']).toContain(id[19])
    })

    it.each([
        ['unitId', { unitId: 'nxuQs' }],
        ['year', { year: 2026 }],
        ['semester', { semester: 1 }],
        ['isTest', { isTest: true }],
        ['seq', { seq: 2 }],
    ])('%s 变化则 id 变化', async (_label, patch) => {
        const base = await deriveOfflineBatchId(BASE)
        expect(await deriveOfflineBatchId({ ...BASE, ...patch })).not.toBe(base)
    })

    it('非 ASCII unitId 不会因编码退化而碰撞', async () => {
        const [a, b] = await Promise.all([
            deriveOfflineBatchId({ ...BASE, unitId: '书院甲' }),
            deriveOfflineBatchId({ ...BASE, unitId: '书院乙' }),
        ])
        expect(a).not.toBe(b)
    })
})
