/**
 * JWK 归一化。
 *
 * 为什么需要：Web Crypto 导出的 JWK 带 `key_ops` / `ext` / `alg` 三个**实现相关**字段，
 * 而这些密钥要跨实现流转——公钥会被编译进小程序、由 node-forge 的 portable-provider 消费
 * （决策 #5），公钥文件还会长期存在 git 里被逐字节比对。
 *
 * 两个具体危害：
 * 1. `importKey` 会校验 `key_ops` 与请求用途一致。JWK 经落盘、JSON 往返、
 *    或由另一实现（node-forge 导出的 JWK 无 `key_ops`）产生后，这个字段并不可靠，
 *    保留反而导致"同一把密钥在另一端导入失败"。用途应由调用点显式给出。
 * 2. `ext` / `createdAt` 之类的噪声字段进入发布产物，会让"公钥有没有变"这个问题
 *    无法靠 diff 回答。
 */
import type { Jwk } from '../types'

/** 只保留密码学意义上必要的字段，按固定顺序排列（便于逐字节比对）。 */
const RSA_PUBLIC_FIELDS = ['kty', 'n', 'e'] as const
const RSA_PRIVATE_FIELDS = ['kty', 'n', 'e', 'd', 'p', 'q', 'dp', 'dq', 'qi'] as const

/**
 * 归一化为可发布/可跨实现导入的 JWK：
 * 去掉 `key_ops` / `ext` / `alg`，并按固定字段顺序重建。
 * 私钥字段存在时一并保留（同一函数处理公私钥，避免调用点判断错）。
 */
export function normalizeJwk(jwk: Jwk): Jwk {
    const fields = typeof jwk['d'] === 'string' ? RSA_PRIVATE_FIELDS : RSA_PUBLIC_FIELDS
    const out: Jwk = { kty: jwk.kty }
    for (const field of fields) {
        const value = jwk[field]
        if (value !== undefined) {
            out[field] = value
        }
    }
    return out
}

/** 断言为公钥形态：归一化后再抹掉任何私钥分量，用于对外交付的公钥文件。 */
export function publicJwkOnly(jwk: Jwk): Jwk {
    const out: Jwk = { kty: jwk.kty }
    for (const field of RSA_PUBLIC_FIELDS) {
        const value = jwk[field]
        if (value !== undefined) {
            out[field] = value
        }
    }
    return out
}
