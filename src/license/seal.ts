/**
 * 口令加密段（`enc`）的密封与解封。
 *
 * PBKDF2-SHA256(1 200 000) → AES-256-GCM。
 * 迭代次数取值依据见 `dual-mode/poc/README.md` 的标定表（决策 #44）：
 * 本机 ~124 ms，低端办公机按 4× 估算约 0.5 s，只在激活时付一次；
 * 同时高于 OWASP 对 PBKDF2-SHA256 的 600 000 建议值。
 *
 * 直接用 Web Crypto（不经 `CryptoProvider`）：PBKDF2 不在 provider 接口里，
 * 而口令解封只发生在 Node 侧。
 */
import { base64ToBytes, bytesToBase64, utf8ToBytes } from '../crypto/encoding'
import { sha256Hex } from '../crypto/hash'
import { LicenseError } from './errors'
import type { SealedSection } from './types'

/** PBKDF2 迭代次数（决策 #44）。 */
export const PBKDF2_ITERATIONS = 1_200_000

/** 允许的 PBKDF2 迭代次数范围（防 DoS：拒绝对合法签名文件的迭代次数被篡改成 1e9）。 */
const MIN_ITERATIONS = 1_000
const MAX_ITERATIONS = 10_000_000

const SALT_BYTES = 16
const IV_BYTES = 12

interface SubtleSealLike {
    importKey(
        format: string,
        keyData: Uint8Array,
        algorithm: unknown,
        extractable: boolean,
        keyUsages: string[],
    ): Promise<unknown>
    deriveKey(
        algorithm: unknown,
        baseKey: unknown,
        derivedKeyAlgorithm: unknown,
        extractable: boolean,
        keyUsages: string[],
    ): Promise<unknown>
    encrypt(algorithm: unknown, key: unknown, data: Uint8Array): Promise<ArrayBuffer>
    decrypt(algorithm: unknown, key: unknown, data: Uint8Array): Promise<ArrayBuffer>
}

interface CryptoSealLike {
    subtle: SubtleSealLike
    getRandomValues<T extends Uint8Array>(array: T): T
}

function getCrypto(): CryptoSealLike {
    const g = globalThis as unknown as { crypto?: CryptoSealLike }
    const c = g.crypto
    if (!c || !c.subtle) {
        throw new Error('当前环境不支持 Web Crypto API，无法处理授权文件口令')
    }
    return c
}

async function deriveAesKey(password: string, salt: Uint8Array, iterations: number): Promise<unknown> {
    const subtle = getCrypto().subtle
    const baseKey = await subtle.importKey('raw', utf8ToBytes(password), { name: 'PBKDF2' }, false, [
        'deriveKey',
    ])
    return subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    )
}

/** 用口令密封任意对象。`hash` 覆盖密封前的 JSON 明文。 */
export async function sealSecret(
    secret: unknown,
    password: string,
    iterations: number = PBKDF2_ITERATIONS,
): Promise<SealedSection> {
    const c = getCrypto()
    const salt = c.getRandomValues(new Uint8Array(SALT_BYTES))
    const iv = c.getRandomValues(new Uint8Array(IV_BYTES))
    const plain = utf8ToBytes(JSON.stringify(secret))
    const key = await deriveAesKey(password, salt, iterations)
    const cipher = await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
    return {
        alg: { kdf: 'PBKDF2-SHA256', iterations, aes: 'AES-256-GCM' },
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        data: bytesToBase64(new Uint8Array(cipher)),
        hash: await sha256Hex(plain),
    }
}

/**
 * 用口令解封。
 *
 * 两级失败区分是有意的：
 * - GCM 认证失败 → `bad-password`（口令错，用户重输即可）
 * - GCM 通过但 hash 不符 → `content-corrupt`（文件损坏，重输口令没用，得重新要文件）
 */
export async function openSecret<T>(enc: SealedSection, password: string): Promise<T> {
    // 迭代次数边界校验（防 DoS）：KDF 参数虽已纳入签名，但 openSecret 作为独立入口
    // 仍需自校验——拒绝非法值，避免 WebCrypto 抛原始异常或 1e9 次迭代卡顿。
    const iterations = typeof enc.alg.iterations === 'number' ? enc.alg.iterations : 0
    if (
        !Number.isInteger(iterations) ||
        iterations < MIN_ITERATIONS ||
        iterations > MAX_ITERATIONS
    ) {
        throw new LicenseError('content-corrupt', '口令加密参数超出允许范围')
    }
    let key: unknown
    try {
        key = await deriveAesKey(password, base64ToBytes(enc.salt), iterations)
    } catch {
        // salt 损坏 / base64 非法 / 其他派生错误 → 文件损坏，重输口令无用
        throw new LicenseError('content-corrupt')
    }
    let plain: Uint8Array
    try {
        const buf = await getCrypto().subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToBytes(enc.iv) },
            key,
            base64ToBytes(enc.data),
        )
        plain = new Uint8Array(buf)
    } catch {
        throw new LicenseError('bad-password')
    }
    if ((await sha256Hex(plain)) !== enc.hash) {
        throw new LicenseError('content-corrupt')
    }
    try {
        return JSON.parse(decodeUtf8(plain)) as T
    } catch {
        throw new LicenseError('content-corrupt', 'JSON 解析失败')
    }
}

/**
 * 字节 → UTF-8 字符串。
 * 用 `TextDecoder` 而非 `bytesToUtf8`：机密段含完整 UnitConfig（励行书院 87 KB），
 * 纯 JS 逐码点解码在这个量级上明显更慢，而本文件本就只在 Node 侧运行。
 */
function decodeUtf8(bytes: Uint8Array): string {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}
