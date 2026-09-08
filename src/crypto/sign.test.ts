import { describe, expect, it } from 'vitest'
import { utf8ToBytes } from './encoding'
import {
    RSA_PSS_ALG,
    RSA_PSS_SALT_LENGTH,
    canonical,
    generateSignKeyPair,
    signBytes,
    verifyBytes,
} from './sign'

// 2048 位密钥生成在慢机上可能超过默认 5s
const KEYGEN_TIMEOUT = 30_000

describe('canonical', () => {
    it('键序不同的等价对象序列化结果一致', () => {
        expect(canonical({ b: 1, a: 2 })).toBe(canonical({ a: 2, b: 1 }))
    })

    it('递归排序嵌套对象', () => {
        expect(canonical({ x: { d: 1, c: 2 } })).toBe('{"x":{"c":2,"d":1}}')
    })

    it('数组保持原序（重排会改变语义）', () => {
        expect(canonical([3, 1, 2])).toBe('[3,1,2]')
        expect(canonical([3, 1, 2])).not.toBe(canonical([1, 2, 3]))
    })

    it('值变化即序列化变化（签名覆盖范围的前提）', () => {
        expect(canonical({ expiresAt: 1 })).not.toBe(canonical({ expiresAt: 2 }))
    })

    it('null 与嵌套数组内的对象也被排序', () => {
        expect(canonical({ a: null, list: [{ z: 1, y: 2 }] })).toBe('{"a":null,"list":[{"y":2,"z":1}]}')
    })
})

describe('RSA-PSS 签名', () => {
    it(
        '签名往返：同数据同密钥验签通过',
        async () => {
            const kp = await generateSignKeyPair()
            const data = utf8ToBytes('励行书院-2026-授权')
            const sig = await signBytes(kp.privateKeyJwk, data)
            expect(await verifyBytes(kp.publicKeyJwk, data, sig)).toBe(true)
        },
        KEYGEN_TIMEOUT,
    )

    it(
        '篡改数据后验签失败',
        async () => {
            const kp = await generateSignKeyPair()
            const sig = await signBytes(kp.privateKeyJwk, utf8ToBytes('expiresAt=2027'))
            expect(await verifyBytes(kp.publicKeyJwk, utf8ToBytes('expiresAt=2099'), sig)).toBe(false)
        },
        KEYGEN_TIMEOUT,
    )

    it(
        '换一把无关公钥验签失败',
        async () => {
            const [a, b] = await Promise.all([generateSignKeyPair(), generateSignKeyPair()])
            const data = utf8ToBytes('payload')
            const sig = await signBytes(a.privateKeyJwk, data)
            expect(await verifyBytes(b.publicKeyJwk, data, sig)).toBe(false)
        },
        KEYGEN_TIMEOUT,
    )

    it(
        '伪造的全零签名被拒（不抛异常，归一化为 false）',
        async () => {
            const kp = await generateSignKeyPair()
            const zeros = 'A'.repeat(344) // base64(256 字节全零) 长度
            expect(await verifyBytes(kp.publicKeyJwk, utf8ToBytes('x'), zeros)).toBe(false)
        },
        KEYGEN_TIMEOUT,
    )

    it(
        '非法公钥不抛异常，返回 false',
        async () => {
            expect(await verifyBytes({ kty: 'RSA', n: '!!!', e: 'AQAB' }, utf8ToBytes('x'), 'AAAA')).toBe(
                false,
            )
        },
        KEYGEN_TIMEOUT,
    )

    it(
        '导出的 JWK 经 JSON 往返后仍可用（落盘 → 读回场景）',
        async () => {
            const kp = await generateSignKeyPair()
            const roundTripped = JSON.parse(JSON.stringify(kp)) as typeof kp
            const data = utf8ToBytes('落盘往返')
            const sig = await signBytes(roundTripped.privateKeyJwk, data)
            expect(await verifyBytes(roundTripped.publicKeyJwk, data, sig)).toBe(true)
        },
        KEYGEN_TIMEOUT,
    )

    it(
        '带 key_ops/alg 的 JWK 也能导入（跨实现兼容）',
        async () => {
            const kp = await generateSignKeyPair()
            const pub = { ...kp.publicKeyJwk, key_ops: ['encrypt'], alg: 'RS256', ext: false }
            const data = utf8ToBytes('兼容性')
            const sig = await signBytes(kp.privateKeyJwk, data)
            expect(await verifyBytes(pub, data, sig)).toBe(true)
        },
        KEYGEN_TIMEOUT,
    )

    it('算法常量与文件格式约定一致', () => {
        expect(RSA_PSS_ALG).toBe('RSA-PSS-SHA256')
        expect(RSA_PSS_SALT_LENGTH).toBe(32)
    })
})
