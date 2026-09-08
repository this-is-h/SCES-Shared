/**
 * base64 / UTF-8 编解码纯函数。
 * 不依赖 `btoa`/`atob`/`TextEncoder`（小程序等环境可能缺失），保证三端可用。
 */

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

import { nz } from '../nullish'

/** 字节数组 → base64 字符串。 */
export function bytesToBase64(bytes: Uint8Array): string {
    let result = ''
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i]!
        const b1 = bytes[i + 1]
        const b2 = bytes[i + 2]
        result += B64_CHARS[b0 >> 2]!
        result += B64_CHARS[((b0 & 0x03) << 4) | (nz(b1, 0) >> 4)]!
        if (b1 === undefined) {
            result += '=='
            break
        }
        result += B64_CHARS[((b1 & 0x0f) << 2) | (nz(b2, 0) >> 6)]!
        if (b2 === undefined) {
            result += '='
            break
        }
        result += B64_CHARS[b2 & 0x3f]!
    }
    return result
}

/** base64 字符串 → 字节数组（忽略非法字符与填充）。 */
export function base64ToBytes(b64: string): Uint8Array {
    const out: number[] = []
    let buffer = 0
    let bits = 0
    for (const ch of String(nz(b64, ''))) {
        if (ch === '=') break
        const val = B64_CHARS.indexOf(ch)
        if (val < 0) continue
        buffer = (buffer << 6) | val
        bits += 6
        if (bits >= 8) {
            bits -= 8
            out.push((buffer >> bits) & 0xff)
        }
    }
    return new Uint8Array(out)
}

/** 字符串 → UTF-8 字节数组。 */
export function utf8ToBytes(text: string): Uint8Array {
    const out: number[] = []
    for (let i = 0; i < text.length; i++) {
        let code = text.codePointAt(i)!
        if (code > 0xffff) i++ // 跳过代理对低位
        if (code < 0x80) {
            out.push(code)
        } else if (code < 0x800) {
            out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
        } else if (code < 0x10000) {
            out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
        } else {
            out.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3f),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f),
            )
        }
    }
    return new Uint8Array(out)
}

/** UTF-8 字节数组 → 字符串。 */
export function bytesToUtf8(bytes: Uint8Array): string {
    let result = ''
    for (let i = 0; i < bytes.length; ) {
        const b0 = bytes[i]!
        if (b0 < 0x80) {
            result += String.fromCharCode(b0)
            i++
        } else if (b0 < 0xe0) {
            result += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i + 1]! & 0x3f))
            i += 2
        } else if (b0 < 0xf0) {
            result += String.fromCharCode(
                ((b0 & 0x0f) << 12) | ((bytes[i + 1]! & 0x3f) << 6) | (bytes[i + 2]! & 0x3f),
            )
            i += 3
        } else {
            const cp =
                ((b0 & 0x07) << 18) |
                ((bytes[i + 1]! & 0x3f) << 12) |
                ((bytes[i + 2]! & 0x3f) << 6) |
                (bytes[i + 3]! & 0x3f)
            result += String.fromCodePoint(cp)
            i += 4
        }
    }
    return result
}