import type { AesAlgorithm } from '../types'
import { getCryptoProvider } from './provider'
import type { AesGcmEncryptResult } from './provider'

export const DEFAULT_AES_ALGORITHM: AesAlgorithm = { name: 'AES-GCM', length: 256 }

/** AES-GCM 加密（自动生成 iv，除非指定）。 */
export async function aesGcmEncrypt(
    keyBytes: Uint8Array,
    plaintext: Uint8Array,
    options?: { iv?: Uint8Array },
): Promise<AesGcmEncryptResult> {
    return getCryptoProvider().aesGcmEncrypt(keyBytes, plaintext, options)
}

/** AES-GCM 解密。 */
export async function aesGcmDecrypt(
    keyBytes: Uint8Array,
    iv: Uint8Array,
    ciphertext: Uint8Array,
): Promise<Uint8Array> {
    return getCryptoProvider().aesGcmDecrypt(keyBytes, iv, ciphertext)
}