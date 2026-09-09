/**
 * RSA-PSS-SHA256 签名 / 验签 —— 授权文件（.dysl / .dysd / .dysc / .dysk）的信任基础。
 *
 * 为什么直接用 Web Crypto 而不走 `CryptoProvider`：
 * - `CryptoProvider` 的接口只覆盖 sha256 / RSA-OAEP / AES-GCM / randomBytes，
 *   为签名扩接口会波及小程序侧的 portable-provider（决策 #5 的 vendor 打包坑）。
 * - 签名与验签**只发生在 Node 侧**（管理端主进程、服务商 CLI），那里 Web Crypto 必然可用。
 * - 因此本文件**不镜像进小程序**（`scripts/sync-shared.mjs` 排除），也**不从 `shared/src/index.ts` 导出**，
 *   消费方走子路径 `@sces/shared/crypto/sign` 或相对路径。
 */
import type { Jwk } from '../types'
import { base64ToBytes, bytesToBase64 } from './encoding'
import { normalizeJwk } from './jwk'

/** 签名算法标识（写进文件的 `sig.alg`）。 */
export const RSA_PSS_ALG = 'RSA-PSS-SHA256' as const

/** PSS 盐长度：等于摘要长度（SHA-256 → 32 字节），写进文件的 `sig.saltLength`。 */
export const RSA_PSS_SALT_LENGTH = 32 as const

/** 默认模长。2048 足够（授权文件不是长期机密载体），且签名只有 256 字节。 */
export const DEFAULT_SIGN_MODULUS_LENGTH = 2048

/** RSA-PSS 密钥对（JWK 形式，便于落盘与随文件传输）。 */
export interface SignKeyPair {
    publicKeyJwk: Jwk
    privateKeyJwk: Jwk
}

interface SubtleSignLike {
    generateKey(algorithm: unknown, extractable: boolean, keyUsages: string[]): Promise<unknown>
    exportKey(format: 'jwk', key: unknown): Promise<Jwk>
    importKey(
        format: string,
        keyData: Jwk,
        algorithm: unknown,
        extractable: boolean,
        keyUsages: string[],
    ): Promise<unknown>
    sign(algorithm: unknown, key: unknown, data: Uint8Array): Promise<ArrayBuffer>
    verify(algorithm: unknown, key: unknown, signature: Uint8Array, data: Uint8Array): Promise<boolean>
}

function getSubtle(): SubtleSignLike {
    // 经 unknown 中转，避免与 Node/DOM 的全局 crypto 类型冲突（同 webcrypto.ts 的做法）
    const g = globalThis as unknown as { crypto?: { subtle?: SubtleSignLike } }
    const subtle = g.crypto && g.crypto.subtle
    if (!subtle) {
        throw new Error('当前环境不支持 Web Crypto API，无法进行授权文件验签')
    }
    return subtle
}

const PSS_KEY_ALGORITHM = {
    name: 'RSA-PSS',
    modulusLength: DEFAULT_SIGN_MODULUS_LENGTH,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
}

const PSS_SIGN_PARAMS = { name: 'RSA-PSS', saltLength: RSA_PSS_SALT_LENGTH }

/**
 * 稳定序列化：递归按键名排序后 `JSON.stringify`。
 *
 * 必须有这一层的原因：`JSON.stringify` 的键序取决于对象构造顺序，
 * 签发端与验签端各自构造同一份 header 时键序可能不同 → 签名覆盖范围不可复现。
 * 数组保持原序（数组语义上有序，重排会改变含义）。
 */
export function canonical(value: unknown): string {
    return JSON.stringify(sortDeep(value))
}

function sortDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortDeep)
    }
    if (value !== null && typeof value === 'object') {
        const src = value as Record<string, unknown>
        const out: Record<string, unknown> = {}
        for (const key of Object.keys(src).sort()) {
            out[key] = sortDeep(src[key])
        }
        return out
    }
    return value
}

/** 生成 RSA-PSS 签名密钥对（服务商签名密钥、单位签发密钥都用它）。 */
export async function generateSignKeyPair(
    modulusLength: number = DEFAULT_SIGN_MODULUS_LENGTH,
): Promise<SignKeyPair> {
    const subtle = getSubtle()
    const pair = (await subtle.generateKey({ ...PSS_KEY_ALGORITHM, modulusLength }, true, [
        'sign',
        'verify',
    ])) as { publicKey: unknown; privateKey: unknown }
    const [publicKeyJwk, privateKeyJwk] = await Promise.all([
        subtle.exportKey('jwk', pair.publicKey),
        subtle.exportKey('jwk', pair.privateKey),
    ])
    return { publicKeyJwk: normalizeJwk(publicKeyJwk), privateKeyJwk: normalizeJwk(privateKeyJwk) }
}

/** 用私钥签名任意字节，返回 base64 签名值。 */
export async function signBytes(privateKeyJwk: Jwk, data: Uint8Array): Promise<string> {
    const subtle = getSubtle()
    const key = await subtle.importKey('jwk', normalizeJwk(privateKeyJwk), PSS_KEY_ALGORITHM, false, [
        'sign',
    ])
    const sig = await subtle.sign(PSS_SIGN_PARAMS, key, data)
    return bytesToBase64(new Uint8Array(sig))
}

/**
 * 用公钥验签。
 * 任何异常（公钥格式错、签名长度错）都归一化为 `false`——调用方只关心"是否可信"，
 * 且不同环境抛出的异常文本不一致，泄漏出去会变成用户看不懂的报错。
 */
export async function verifyBytes(
    publicKeyJwk: Jwk,
    data: Uint8Array,
    signatureBase64: string,
): Promise<boolean> {
    try {
        const subtle = getSubtle()
        const key = await subtle.importKey('jwk', normalizeJwk(publicKeyJwk), PSS_KEY_ALGORITHM, false, [
            'verify',
        ])
        return await subtle.verify(PSS_SIGN_PARAMS, key, base64ToBytes(signatureBase64), data)
    } catch {
        return false
    }
}

