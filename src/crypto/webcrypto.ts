import type { Jwk, RsaAlgorithm } from '../types'
import { nz, opt } from '../nullish'
import { setCryptoProvider } from './provider'
import type { AesGcmEncryptResult, CryptoProvider, RsaKeyGenOptions } from './provider'

/**
 * 基于 Web Crypto API 的默认实现。
 * 浏览器与 Node 18+（Electron 主进程）均提供 `globalThis.crypto.subtle`。
 * 通过最小接口访问，避免依赖 DOM 类型。
 */

interface SubtleCryptoLike {
    generateKey(algorithm: unknown, extractable: boolean, keyUsages: string[]): Promise<unknown>
    exportKey(format: 'jwk', key: unknown): Promise<Jwk>
    importKey(
        format: string,
        keyData: Jwk | Uint8Array,
        algorithm: unknown,
        extractable: boolean,
        keyUsages: string[],
    ): Promise<unknown>
    encrypt(algorithm: unknown, key: unknown, data: Uint8Array): Promise<ArrayBuffer>
    decrypt(algorithm: unknown, key: unknown, data: Uint8Array): Promise<ArrayBuffer>
    digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>
}

interface CryptoLike {
    subtle: SubtleCryptoLike
    getRandomValues<T extends Uint8Array>(array: T): T
}

function getGlobalCrypto(): CryptoLike {
    // 经 unknown 中转，避免与 Node/DOM 的全局 crypto 类型冲突
    const g = globalThis as unknown as { crypto?: CryptoLike }
    const cryptoObj = g.crypto
    if (!cryptoObj || !cryptoObj.subtle) {
        throw new Error('当前环境不支持 Web Crypto API，请注入自定义 CryptoProvider')
    }
    return cryptoObj
}

const normalizeRsa = (algorithm?: RsaAlgorithm): { name: 'RSA-OAEP'; hash: string } => ({
    name: 'RSA-OAEP',
    hash: nz(opt(algorithm, 'hash'), 'SHA-256'),
})

export const webCryptoProvider: CryptoProvider = {
    name: 'webcrypto',

    randomBytes(length: number): Uint8Array {
        const out = new Uint8Array(length)
        getGlobalCrypto().getRandomValues(out)
        return out
    },

    async sha256(data: Uint8Array): Promise<Uint8Array> {
        const buf = await getGlobalCrypto().subtle.digest('SHA-256', data)
        return new Uint8Array(buf)
    },

    async generateRsaOaepKeyPair(options?: RsaKeyGenOptions) {
        const { modulusLength = 2048, hash = 'SHA-256' } =
            options !== null && options !== void 0 ? options : {}
        const keyPair = (await getGlobalCrypto().subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash,
            },
            true,
            ['encrypt', 'decrypt'],
        )) as { publicKey: unknown; privateKey: unknown }
        const publicKeyJwk = await getGlobalCrypto().subtle.exportKey('jwk', keyPair.publicKey)
        const privateKeyJwk = await getGlobalCrypto().subtle.exportKey('jwk', keyPair.privateKey)
        return { publicKeyJwk, privateKeyJwk }
    },

    async importRsaPublicKey(jwk: Jwk, algorithm?: RsaAlgorithm) {
        return getGlobalCrypto().subtle.importKey(
            'jwk',
            jwk,
            normalizeRsa(algorithm),
            false,
            ['encrypt'],
        )
    },

    async importRsaPrivateKey(jwk: Jwk, algorithm?: RsaAlgorithm) {
        return getGlobalCrypto().subtle.importKey(
            'jwk',
            jwk,
            normalizeRsa(algorithm),
            false,
            ['decrypt'],
        )
    },

    async rsaEncrypt(publicKey: unknown, data: Uint8Array) {
        const buf = await getGlobalCrypto().subtle.encrypt(
            { name: 'RSA-OAEP' },
            publicKey,
            data,
        )
        return new Uint8Array(buf)
    },

    async rsaDecrypt(privateKey: unknown, data: Uint8Array) {
        const buf = await getGlobalCrypto().subtle.decrypt(
            { name: 'RSA-OAEP' },
            privateKey,
            data,
        )
        return new Uint8Array(buf)
    },

    async aesGcmEncrypt(
        keyBytes: Uint8Array,
        plaintext: Uint8Array,
        options?: { iv?: Uint8Array },
    ): Promise<AesGcmEncryptResult> {
        const key = await getGlobalCrypto().subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM' },
            false,
            ['encrypt'],
        )
        const iv =
            options && options.iv !== null && options.iv !== void 0
                ? options.iv
                : getGlobalCrypto().getRandomValues(new Uint8Array(12))
        const buf = await getGlobalCrypto().subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
        return { iv, ciphertext: new Uint8Array(buf) }
    },

    async aesGcmDecrypt(keyBytes: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array) {
        const key = await getGlobalCrypto().subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM' },
            false,
            ['decrypt'],
        )
        const buf = await getGlobalCrypto().subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
        return new Uint8Array(buf)
    },
}

/** 便捷：注册默认 WebCrypto 实现（浏览器 / Node 18+）。 */
export function useWebCryptoProvider(): void {
    setCryptoProvider(webCryptoProvider)
}