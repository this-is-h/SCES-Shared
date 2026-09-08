import { describe, expect, it } from 'vitest'
import {
    FINGERPRINT_ALPHABET,
    FINGERPRINT_LENGTH,
    computeFingerprint,
    fingerprintFromRaw,
    fingerprintRawParts,
} from './fingerprint'

describe('fingerprintFromRaw', () => {
    it('形态为 XXXX-XXXX-XXXX（只含字母表内字符）', () => {
        expect(fingerprintFromRaw('a|b|c|d|e')).toMatch(
            /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
        )
    })

    it('同输入稳定', () => {
        expect(fingerprintFromRaw('host|win32|x64|aa:bb|user')).toBe(
            fingerprintFromRaw('host|win32|x64|aa:bb|user'),
        )
    })

    it('任一部件变化则机器码变化', () => {
        const base = fingerprintFromRaw('host|win32|x64|aa:bb|user')
        expect(fingerprintFromRaw('host2|win32|x64|aa:bb|user')).not.toBe(base)
        expect(fingerprintFromRaw('host|win32|x64|aa:bc|user')).not.toBe(base)
        expect(fingerprintFromRaw('host|win32|x64|aa:bb|user2')).not.toBe(base)
    })

    it('产出的每个字符都在字母表内', () => {
        const code = fingerprintFromRaw('任意原料串').replace(/-/g, '')
        expect(code).toHaveLength(FINGERPRINT_LENGTH)
        for (const ch of code) {
            expect(FINGERPRINT_ALPHABET).toContain(ch)
        }
    })

    it('字母表恰好 32 个字符且无重复（5 bit 整除的硬要求）', () => {
        expect(FINGERPRINT_ALPHABET).toHaveLength(32)
        expect(new Set(FINGERPRINT_ALPHABET).size).toBe(32)
    })

    it('字母表不含形似字符 I/L/O，也不含 U', () => {
        for (const ch of 'ILOU') {
            expect(FINGERPRINT_ALPHABET).not.toContain(ch)
        }
    })

    it('永不产出 undefined 拼接（31 字符字母表曾导致的越界回归）', () => {
        for (let i = 0; i < 2000; i++) {
            expect(fingerprintFromRaw(`raw-${i}`)).not.toContain('undefined')
        }
    })

    it('不同原料串大量抽样无重复（派生分布合理）', () => {
        const seen = new Set<string>()
        for (let i = 0; i < 500; i++) {
            seen.add(fingerprintFromRaw(`host-${i}|win32|x64|aa:bb:cc:dd:ee:${i}|user`))
        }
        expect(seen.size).toBe(500)
    })
})

describe('computeFingerprint', () => {
    it('本机机器码可算出且形态正确', () => {
        expect(computeFingerprint()).toMatch(
            /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
        )
    })

    it('与显式走原料串的结果一致', () => {
        expect(computeFingerprint()).toBe(fingerprintFromRaw(fingerprintRawParts()))
    })

    it('原料串含 5 个用 | 分隔的部件', () => {
        expect(fingerprintRawParts().split('|')).toHaveLength(5)
    })
})
