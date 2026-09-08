import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from './encoding'

describe('encoding', () => {
    describe('base64', () => {
        it('空字节 → 空字符串', () => {
            expect(bytesToBase64(new Uint8Array(0))).toBe('')
            expect(base64ToBytes('').length).toBe(0)
        })

        it('标准向量：ASCII', () => {
            const bytes = utf8ToBytes('hello world')
            expect(bytesToBase64(bytes)).toBe('aGVsbG8gd29ybGQ=')
            expect(bytesToUtf8(base64ToBytes('aGVsbG8gd29ybGQ='))).toBe('hello world')
        })

        it('标准向量：中文（多字节 UTF-8）', () => {
            const text = '学生综合素质测评管理系统'
            const b64 = bytesToBase64(utf8ToBytes(text))
            expect(bytesToUtf8(base64ToBytes(b64))).toBe(text)
        })

        it('任意字节往返一致', () => {
            const bytes = new Uint8Array(256)
            for (let i = 0; i < 256; i++) bytes[i] = i
            const b64 = bytesToBase64(bytes)
            expect(base64ToBytes(b64)).toEqual(bytes)
        })

        it('忽略非法字符与填充', () => {
            expect(bytesToUtf8(base64ToBytes('aGVsbG8gd29ybGQ=!!'))).toBe('hello world')
        })
    })

    describe('utf8', () => {
        it('ASCII 往返', () => {
            expect(bytesToUtf8(utf8ToBytes('abc123'))).toBe('abc123')
        })

        it('中文往返', () => {
            const text = '宁夏大学励行书院德育分办法'
            expect(bytesToUtf8(utf8ToBytes(text))).toBe(text)
        })

        it('emoji（代理对）往返', () => {
            const text = '🎓📚'
            expect(bytesToUtf8(utf8ToBytes(text))).toBe(text)
        })

        it('混合字符往返', () => {
            const text = 'A中🎓\n\t'
            expect(bytesToUtf8(utf8ToBytes(text))).toBe(text)
        })
    })
})