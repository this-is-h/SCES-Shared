import type { Jwk, RsaAlgorithm } from '../types'

/** RSA 密钥生成选项。 */
export interface RsaKeyGenOptions {
    modulusLength?: number
    hash?: RsaAlgorithm['hash']
}

/** AES-GCM 加密结果。 */
export interface AesGcmEncryptResult {
    iv: Uint8Array
    ciphertext: Uint8Array
}

/**
 * 平台加密适配器接口。
 *
 * shared 层不直接调用平台 API（`crypto.subtle` / `wx.*`），而是通过本接口注入实现：
 * - 浏览器 / Node 18+：`webCryptoProvider`（默认）。
 * - 微信小程序：各端适配层基于 `wx` API 实现并注入。
 * 密钥句柄用 `unknown` 表示，避免依赖 DOM 的 `CryptoKey` 类型。
 */
export interface CryptoProvider {
    readonly name: string
    /** 生成密码学安全随机字节。 */
    randomBytes(length: number): Uint8Array
    /** SHA-256 摘要。 */
    sha256(data: Uint8Array): Promise<Uint8Array>
    /** 生成 RSA-OAEP 密钥对，导出 JWK。 */
    generateRsaOaepKeyPair(options?: RsaKeyGenOptions): Promise<{
        publicKeyJwk: Jwk
        privateKeyJwk: Jwk
    }>
    /** 导入 RSA 公钥（用于加密）。 */
    importRsaPublicKey(jwk: Jwk, algorithm?: RsaAlgorithm): Promise<unknown>
    /** 导入 RSA 私钥（用于解密）。 */
    importRsaPrivateKey(jwk: Jwk, algorithm?: RsaAlgorithm): Promise<unknown>
    /** RSA-OAEP 加密。 */
    rsaEncrypt(publicKey: unknown, data: Uint8Array, algorithm?: RsaAlgorithm): Promise<Uint8Array>
    /** RSA-OAEP 解密。 */
    rsaDecrypt(privateKey: unknown, data: Uint8Array, algorithm?: RsaAlgorithm): Promise<Uint8Array>
    /** AES-GCM 加密（自动生成 iv，或传入指定 iv）。 */
    aesGcmEncrypt(
        keyBytes: Uint8Array,
        plaintext: Uint8Array,
        options?: { iv?: Uint8Array },
    ): Promise<AesGcmEncryptResult>
    /** AES-GCM 解密。 */
    aesGcmDecrypt(keyBytes: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>
}

let currentProvider: CryptoProvider | null = null

/** 注册平台加密适配器。各端启动时调用一次。 */
export function setCryptoProvider(provider: CryptoProvider): void {
    currentProvider = provider
}

/** 获取当前 CryptoProvider；未初始化时抛错。 */
export function getCryptoProvider(): CryptoProvider {
    if (!currentProvider) {
        throw new Error('CryptoProvider 未初始化，请先调用 setCryptoProvider()')
    }
    return currentProvider
}