import { getCryptoProvider } from './provider'

/** 字节 → hex 字符串。 */
export function bytesToHex(bytes: Uint8Array): string {
    let result = ''
    for (const b of bytes) result += b.toString(16).padStart(2, '0')
    return result
}

/** SHA-256 摘要（字节）。 */
export async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
    return getCryptoProvider().sha256(data)
}

/** SHA-256 摘要（hex 字符串，用于文件哈希）。 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
    return bytesToHex(await sha256Bytes(data))
}