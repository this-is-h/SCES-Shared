import type { Jwk, RsaAlgorithm } from '../types'
import { opt } from '../nullish'
import { getCryptoProvider } from './provider'

export const DEFAULT_RSA_ALGORITHM: RsaAlgorithm = { name: 'RSA-OAEP', hash: 'SHA-256' }

/** 生成 RSA-OAEP 密钥对（JWK）。 */
export async function generateRsaKeyPair(options?: {
    modulusLength?: number
    hash?: RsaAlgorithm['hash']
}): Promise<{ publicKeyJwk: Jwk; privateKeyJwk: Jwk }> {
    return getCryptoProvider().generateRsaOaepKeyPair(options)
}

/** 导入 RSA 公钥（用于加密）。 */
export async function importRsaPublicKey(
    jwk: Jwk,
    algorithm: RsaAlgorithm = DEFAULT_RSA_ALGORITHM,
): Promise<unknown> {
    return getCryptoProvider().importRsaPublicKey(jwk, algorithm)
}

/** 导入 RSA 私钥（用于解密）。 */
export async function importRsaPrivateKey(
    jwk: Jwk,
    algorithm: RsaAlgorithm = DEFAULT_RSA_ALGORITHM,
): Promise<unknown> {
    return getCryptoProvider().importRsaPrivateKey(jwk, algorithm)
}

/** RSA-OAEP 加密。 */
export async function rsaEncrypt(
    publicKey: unknown,
    data: Uint8Array,
    algorithm: RsaAlgorithm = DEFAULT_RSA_ALGORITHM,
): Promise<Uint8Array> {
    return getCryptoProvider().rsaEncrypt(publicKey, data, algorithm)
}

/** RSA-OAEP 解密。 */
export async function rsaDecrypt(
    privateKey: unknown,
    data: Uint8Array,
    algorithm: RsaAlgorithm = DEFAULT_RSA_ALGORITHM,
): Promise<Uint8Array> {
    return getCryptoProvider().rsaDecrypt(privateKey, data, algorithm)
}

/** 校验 RSA 密钥对：加密→解密往返一致。密钥不匹配时解密抛错，返回 false。 */
export async function verifyRsaKeyPair(
    keyPair: { publicKeyJwk: Jwk; privateKeyJwk: Jwk },
    algorithm: RsaAlgorithm = DEFAULT_RSA_ALGORITHM,
): Promise<boolean> {
    if (!opt(keyPair, 'publicKeyJwk') || !opt(keyPair, 'privateKeyJwk')) return false
    try {
        const publicKey = await importRsaPublicKey(keyPair.publicKeyJwk, algorithm)
        const privateKey = await importRsaPrivateKey(keyPair.privateKeyJwk, algorithm)
        const challenge = getCryptoProvider().randomBytes(32)
        const encrypted = await rsaEncrypt(publicKey, challenge, algorithm)
        const decrypted = await rsaDecrypt(privateKey, encrypted, algorithm)
        if (decrypted.length !== challenge.length) return false
        for (let i = 0; i < challenge.length; i++) {
            if (decrypted[i] !== challenge[i]) return false
        }
        return true
    } catch (e) {
        return false
    }
}