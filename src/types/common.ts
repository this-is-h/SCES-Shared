/**
 * 通用类型：JWK、算法参数、时间戳。
 * 无平台依赖：不引用 DOM / Node 类型。
 */

/** JSON Web Key（RSA 公钥/私钥）。字段与 Web Crypto 的 JsonWebKey 对齐，但独立定义以保持无平台依赖。 */
export interface Jwk {
    kty: string
    n?: string
    e?: string
    d?: string
    p?: string
    q?: string
    dp?: string
    dq?: string
    qi?: string
    alg?: string
    use?: string
    key_ops?: string[]
    ext?: boolean
    [key: string]: unknown
}

/** RSA-OAEP 算法参数。 */
export interface RsaAlgorithm {
    name: 'RSA-OAEP'
    hash: 'SHA-256' | 'SHA-384' | 'SHA-512'
}

/** AES-GCM 算法参数。 */
export interface AesAlgorithm {
    name: 'AES-GCM'
    length: 128 | 192 | 256
}

/** 时间戳（epoch 毫秒）。 */
export type EpochMs = number

/** 通用校验结果。 */
export interface ValidationResult {
    ok: boolean
    errors: string[]
}