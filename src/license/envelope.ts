/**
 * 签名信封：`canonical(header) | canonical(enc.alg) | enc.data | enc.hash` 一起签。
 *
 * 为什么必须一起签：
 * - 只签 header → 密文段可被整体替换（换成另一个单位的配置）。
 * - 只签密文 → `expiresAt` / `boundFingerprint` 可被随意改。
 * - 不签 `enc.alg`（KDF 参数/迭代次数）→ 持合法签名者可把 `iterations` 改成 1e9，
 *   签名仍有效但激活时 PBKDF2 卡顿分钟级（DoS）。见决策 #44 追加。
 * POC 断言 4/5/6 逐条验证了三处任一被改都会失败。
 *
 * 本模块对 `.dysl` / `.dysd` / `.dysc` / `.dysk` 通用——它们共用同一套信封语义，
 * 只是 header 的形状不同。
 */
import type { Jwk } from '../types'
import { utf8ToBytes } from '../crypto/encoding'
import { RSA_PSS_ALG, RSA_PSS_SALT_LENGTH, canonical, signBytes, verifyBytes } from '../crypto/sign'
import { LicenseError } from './errors'
import type { FileSignature, SealedSection, VerifyKey } from './types'

/** 构造被签名的字节序列。签发端与验签端必须用同一个函数，否则签名永远不匹配。 */
export function envelopeSignedBytes(header: unknown, enc: SealedSection): Uint8Array {
    return utf8ToBytes(`${canonical(header)}|${canonical(enc.alg)}|${enc.data}|${enc.hash}`)
}

/** 用签名私钥为信封签名。 */
export async function signEnvelope(
    header: unknown,
    enc: SealedSection,
    signKeyId: string,
    signPrivateKeyJwk: Jwk,
): Promise<FileSignature> {
    const value = await signBytes(signPrivateKeyJwk, envelopeSignedBytes(header, enc))
    return { alg: RSA_PSS_ALG, saltLength: RSA_PSS_SALT_LENGTH, signKeyId, value }
}

/**
 * 验签。失败即抛 `LicenseError`，不返回布尔值——
 * 调用方漏判布尔返回值是这类代码最典型的严重 bug，抛错让它无法被忽略。
 */
export async function verifyEnvelope(
    header: unknown,
    enc: SealedSection,
    sig: FileSignature,
    verifyKeys: VerifyKey[],
): Promise<void> {
    if (sig.alg !== RSA_PSS_ALG) {
        throw new LicenseError('bad-signature', `不支持的签名算法 ${String(sig.alg)}`)
    }
    const key = verifyKeys.find((k) => k.keyId === sig.signKeyId)
    if (!key) {
        throw new LicenseError('unknown-sign-key', sig.signKeyId)
    }
    const ok = await verifyBytes(
        key.publicKeyJwk,
        envelopeSignedBytes(header, enc),
        sig.value,
    )
    if (!ok) {
        throw new LicenseError('bad-signature')
    }
}
