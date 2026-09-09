/**
 * 可移植 CryptoProvider（纯 JS，无 Web Crypto 依赖）。
 *
 * 用途：微信小程序等无 `crypto.subtle` 的环境。加密结果与 `webCryptoProvider`（管理端/浏览器）
 * 完全互通（见 `interop.test.ts`）：
 * - RSA-OAEP：node-forge（OAEP 摘要与 MGF1 均为 SHA-256），对齐 WebCrypto `RSA-OAEP + SHA-256`。
 * - AES-256-GCM：@noble/ciphers `gcm`，密文布局为 `ciphertext || tag(16B)`，与 WebCrypto 一致。
 * - SHA-256：@noble/hashes。
 *
 * 说明（回退决策）：原计划用 jsrsasign，但其 npm 构建（11.x）不含 RSA-OAEP 能力
 * （`Cipher.encrypt` 仅支持 PKCS1v1.5，无 `encryptOAEP`），互通 gating 失败，
 * 遂按回退策略改用 node-forge 实现 RSA-OAEP，AES/SHA 仍用 @noble。接口不变。
 *
 * 注意：本模块**不从 shared 顶层导出**（避免 server/management 打包引入 node-forge），
 * 也未设包子路径导出；消费方为微信小程序——经 `scripts/sync-shared.mjs` 源码镜像以相对路径使用。
 */
import forge from 'node-forge'
// 微信「构建 npm」不支持子路径导入（@noble/* 主入口又故意抛错），
// 故 @noble 原语由 scripts 预打包为单一 CJS 文件 vendor/noble.js（自包含，随镜像进小程序）
import { gcm, sha256 as nobleSha256, randomBytes as nobleRandomBytes } from './vendor/noble.js'
import { nz, opt } from '../nullish'
import type { Jwk } from '../types'
import type { AesGcmEncryptResult, CryptoProvider, RsaKeyGenOptions } from './provider'

/** provider 构造选项。 */
export interface PortableProviderOptions {
    /**
     * 随机字节源。小程序需注入 `wx.getRandomValues`；node/浏览器默认用 @noble/hashes。
     * 必须是密码学安全随机源。
     */
    randomBytes?: (length: number) => Uint8Array
}

/** node-forge 的 RSA 公钥/私钥句柄（本模块内 importRsaPublicKey/PrivateKey 的返回值）。 */
type ForgePublicKey = forge.pki.rsa.PublicKey
type ForgePrivateKey = forge.pki.rsa.PrivateKey

/** base64url（JWK 字段）→ forge BigInteger。 */
function b64urlToBigInteger(b64url: string): forge.jsbn.BigInteger {
    const hex = bytesToHexLocal(base64urlToBytes(b64url))
    // forge BigInteger 空 hex 需按 0 处理
    return new forge.jsbn.BigInteger(hex === '' ? '0' : hex, 16)
}

/** forge BigInteger → base64url（无填充），用于导出 JWK。 */
function bigIntegerToB64url(n: forge.jsbn.BigInteger): string {
    let hex = n.toString(16)
    if (hex.length % 2 === 1) hex = `0${hex}`
    return bytesToBase64url(hexToBytesLocal(hex))
}

/** base64url → 字节。 */
function base64urlToBytes(b64url: string): Uint8Array {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const bin = forge.util.decode64(b64 + pad)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff
    return out
}

/** 字节 → base64url（无填充）。 */
function bytesToBase64url(bytes: Uint8Array): string {
    return forge.util
        .encode64(bytesToBinaryString(bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

/** hex → 字节。 */
function hexToBytesLocal(hex: string): Uint8Array {
    const clean = hex.length % 2 === 1 ? `0${hex}` : hex
    const out = new Uint8Array(clean.length / 2)
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
    }
    return out
}

/** 字节 → hex。 */
function bytesToHexLocal(bytes: Uint8Array): string {
    let result = ''
    for (let i = 0; i < bytes.length; i++) result += bytes[i]!.toString(16).padStart(2, '0')
    return result
}

/** 字节 → “二进制字符串”（每字符一个字节，0-255），forge 以此为字节序列输入。 */
function bytesToBinaryString(bytes: Uint8Array): string {
    let result = ''
    for (let i = 0; i < bytes.length; i++) result += String.fromCharCode(bytes[i]!)
    return result
}

/** “二进制字符串” → 字节。 */
function binaryStringToBytes(text: string): Uint8Array {
    const out = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
    return out
}

function defaultRandomBytes(length: number): Uint8Array {
    return nobleRandomBytes(length)
}

/** OAEP 参数：摘要与 MGF1 均为 SHA-256，对齐 WebCrypto `RSA-OAEP + SHA-256`。 */
function oaepParams(): { md: forge.md.MessageDigest; mgf1: { md: forge.md.MessageDigest } } {
    return { md: forge.md.sha256.create(), mgf1: { md: forge.md.sha256.create() } }
}

/**
 * 创建可移植 CryptoProvider。
 * @param options.randomBytes 随机字节源（小程序传 `wx.getRandomValues`）。
 */
export function createPortableProvider(options?: PortableProviderOptions): CryptoProvider {
    const randomBytesImpl = nz(opt(options, 'randomBytes'), defaultRandomBytes)

    return {
        name: 'portable',

        randomBytes(length: number): Uint8Array {
            return randomBytesImpl(length)
        },

        async sha256(data: Uint8Array): Promise<Uint8Array> {
            return nobleSha256(data)
        },

        async generateRsaOaepKeyPair(opts?: RsaKeyGenOptions) {
            const modulusLength = nz(opt(opts, 'modulusLength'), 2048)
            const keyPair = forge.pki.rsa.generateKeyPair({ bits: modulusLength, e: 0x10001 })
            const pub = keyPair.publicKey
            const prv = keyPair.privateKey
            const publicKeyJwk: Jwk = {
                kty: 'RSA',
                n: bigIntegerToB64url(pub.n),
                e: bigIntegerToB64url(pub.e),
            }
            const privateKeyJwk: Jwk = {
                kty: 'RSA',
                n: bigIntegerToB64url(prv.n),
                e: bigIntegerToB64url(prv.e),
                d: bigIntegerToB64url(prv.d),
                p: bigIntegerToB64url(prv.p),
                q: bigIntegerToB64url(prv.q),
                dp: bigIntegerToB64url(prv.dP),
                dq: bigIntegerToB64url(prv.dQ),
                qi: bigIntegerToB64url(prv.qInv),
            }
            return { publicKeyJwk, privateKeyJwk }
        },

        async importRsaPublicKey(jwk: Jwk): Promise<unknown> {
            if (!jwk.n || !jwk.e) throw new Error('公钥 JWK 缺少 n/e')
            return forge.pki.setRsaPublicKey(b64urlToBigInteger(jwk.n), b64urlToBigInteger(jwk.e))
        },

        async importRsaPrivateKey(jwk: Jwk): Promise<unknown> {
            if (!jwk.n || !jwk.e || !jwk.d || !jwk.p || !jwk.q || !jwk.dp || !jwk.dq || !jwk.qi) {
                throw new Error('私钥 JWK 缺少必要字段')
            }
            return forge.pki.setRsaPrivateKey(
                b64urlToBigInteger(jwk.n),
                b64urlToBigInteger(jwk.e),
                b64urlToBigInteger(jwk.d),
                b64urlToBigInteger(jwk.p),
                b64urlToBigInteger(jwk.q),
                b64urlToBigInteger(jwk.dp),
                b64urlToBigInteger(jwk.dq),
                b64urlToBigInteger(jwk.qi),
            )
        },

        async rsaEncrypt(publicKey: unknown, data: Uint8Array): Promise<Uint8Array> {
            const encrypted = (publicKey as ForgePublicKey).encrypt(
                bytesToBinaryString(data),
                'RSA-OAEP',
                oaepParams(),
            )
            return binaryStringToBytes(encrypted)
        },

        async rsaDecrypt(privateKey: unknown, data: Uint8Array): Promise<Uint8Array> {
            const decrypted = (privateKey as ForgePrivateKey).decrypt(
                bytesToBinaryString(data),
                'RSA-OAEP',
                oaepParams(),
            )
            return binaryStringToBytes(decrypted)
        },

        async aesGcmEncrypt(
            keyBytes: Uint8Array,
            plaintext: Uint8Array,
            opts?: { iv?: Uint8Array },
        ): Promise<AesGcmEncryptResult> {
            const iv =
                opts && opts.iv !== null && opts.iv !== void 0
                    ? opts.iv
                    : randomBytesImpl(12)
            const ciphertext = gcm(keyBytes, iv).encrypt(plaintext)
            return { iv, ciphertext }
        },

        async aesGcmDecrypt(
            keyBytes: Uint8Array,
            iv: Uint8Array,
            ciphertext: Uint8Array,
        ): Promise<Uint8Array> {
            return gcm(keyBytes, iv).decrypt(ciphertext)
        },
    }
}
