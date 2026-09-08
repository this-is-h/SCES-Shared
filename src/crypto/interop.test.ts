/**
 * 互通 gating 测试：可移植 provider（node-forge + @noble）与 WebCrypto provider 加密结果必须完全互通。
 *
 * 这是 M2 的成败关键——学生端（小程序，node-forge）加密的 .dyf 必须能被管理端（Electron，WebCrypto）解密。
 * 覆盖：
 * - portable 加密 → webcrypto 解密（学生端 → 管理端，核心路径）
 * - webcrypto 加密 → portable 解密（反向）
 * - WebCrypto 生成的 JWK 公钥喂给 portable 加密（JWK 互认）
 * - portable 自身往返（小程序侧自测）
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { setCryptoProvider } from './provider'
import { webCryptoProvider } from './webcrypto'
import { createPortableProvider } from './portable-provider'
import { generateRsaKeyPair } from './rsa'
import { decryptDyfFile, encryptPayload } from './hybrid'
import type { Jwk } from '../types'

const portableProvider = createPortableProvider()

const payload = {
    applyId: 'apply-interop-001',
    revision: 2,
    batchId: 'batch-interop-001',
    personal: { name: '张三', studentId: '20230001', phone: '13800000000' },
    dyf: { '8882': { score: 2 }, '1001': { score: 10, file: ['ZmFrZS1iYXNlNjQ='] } },
}

/** 用 WebCrypto 预先生成一对密钥（模拟管理端创建批次）。 */
let webKeyPair: { publicKeyJwk: Jwk; privateKeyJwk: Jwk }

beforeAll(async () => {
    setCryptoProvider(webCryptoProvider)
    webKeyPair = await generateRsaKeyPair()
})

describe('crypto interop（portable ↔ webcrypto）', () => {
    it('portable 加密 → webcrypto 解密（学生端 → 管理端核心路径）', async () => {
        // 学生端：注入 portable provider，用管理端下发的公钥加密
        setCryptoProvider(portableProvider)
        const file = await encryptPayload({
            payload,
            publicKeyJwk: webKeyPair.publicKeyJwk,
            type: 'apply',
            applyId: payload.applyId,
            revision: payload.revision,
            batchId: payload.batchId,
        })
        expect(file.encrypted).toBe(true)
        expect(file.hash).toBeTruthy()

        // 管理端：切回 webcrypto，用私钥解密
        setCryptoProvider(webCryptoProvider)
        const result = await decryptDyfFile({ file, privateKeyJwk: webKeyPair.privateKeyJwk })
        expect(result.type).toBe('apply')
        expect(result.payload).toEqual(payload)
        expect(result.hash).toBe(file.hash)
    })

    it('webcrypto 加密 → portable 解密（反向）', async () => {
        setCryptoProvider(webCryptoProvider)
        const file = await encryptPayload({
            payload,
            publicKeyJwk: webKeyPair.publicKeyJwk,
            type: 'apply',
            applyId: payload.applyId,
            revision: payload.revision,
            batchId: payload.batchId,
        })

        setCryptoProvider(portableProvider)
        const result = await decryptDyfFile({ file, privateKeyJwk: webKeyPair.privateKeyJwk })
        expect(result.payload).toEqual(payload)
        expect(result.hash).toBe(file.hash)
    })

    it('portable 生成密钥对 → 自身往返', async () => {
        setCryptoProvider(portableProvider)
        const keyPair = await portableProvider.generateRsaOaepKeyPair()
        expect(keyPair.publicKeyJwk.kty).toBe('RSA')
        const file = await encryptPayload({
            payload,
            publicKeyJwk: keyPair.publicKeyJwk,
            type: 'apply',
        })
        const result = await decryptDyfFile({ file, privateKeyJwk: keyPair.privateKeyJwk })
        expect(result.payload).toEqual(payload)
    })

    it('portable 生成密钥对 → webcrypto 可导入并解密（JWK 互认）', async () => {
        setCryptoProvider(portableProvider)
        const keyPair = await portableProvider.generateRsaOaepKeyPair()
        const file = await encryptPayload({
            payload,
            publicKeyJwk: keyPair.publicKeyJwk,
            type: 'apply',
        })

        setCryptoProvider(webCryptoProvider)
        const result = await decryptDyfFile({ file, privateKeyJwk: keyPair.privateKeyJwk })
        expect(result.payload).toEqual(payload)
    })

    it('篡改密文导致解密失败（AES-GCM tag 校验）', async () => {
        setCryptoProvider(portableProvider)
        const file = await encryptPayload({
            payload,
            publicKeyJwk: webKeyPair.publicKeyJwk,
            type: 'apply',
        })
        // 篡改密文 base64（首字符替换）
        file.data = `${file.data!.slice(0, 1) === 'A' ? 'B' : 'A'}${file.data!.slice(1)}`
        setCryptoProvider(webCryptoProvider)
        await expect(
            decryptDyfFile({ file, privateKeyJwk: webKeyPair.privateKeyJwk }),
        ).rejects.toThrow()
    })
})
