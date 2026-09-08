import { beforeAll, describe, expect, it } from 'vitest'
import { sha256Hex } from './hash'
import { useWebCryptoProvider } from './webcrypto'
import { generateRsaKeyPair, verifyRsaKeyPair } from './rsa'
import { aesGcmDecrypt, aesGcmEncrypt } from './aes'
import {
    decryptDyfContainer,
    decryptDyfContainerFromSource,
    decryptDyfFile,
    encryptDyfContainer,
    encryptDyfContainerToSink,
    encryptPayload,
    readDyfContainerHeader,
} from './hybrid'
import { utf8ToBytes } from './encoding'

beforeAll(() => {
    useWebCryptoProvider()
})

describe('crypto', () => {
    describe('sha256', () => {
        it('已知向量：空串', async () => {
            expect(await sha256Hex(new Uint8Array(0))).toBe(
                'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            )
        })

        it('已知向量：abc', async () => {
            expect(await sha256Hex(utf8ToBytes('abc'))).toBe(
                'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
            )
        })
    })

    describe('rsa', () => {
        it('生成密钥对并往返校验', async () => {
            const keyPair = await generateRsaKeyPair()
            expect(keyPair.publicKeyJwk.kty).toBe('RSA')
            expect(keyPair.privateKeyJwk.kty).toBe('RSA')
            expect(await verifyRsaKeyPair(keyPair)).toBe(true)
        })

        it('密钥对不匹配时校验失败', async () => {
            const a = await generateRsaKeyPair()
            const b = await generateRsaKeyPair()
            expect(
                await verifyRsaKeyPair({
                    publicKeyJwk: a.publicKeyJwk,
                    privateKeyJwk: b.privateKeyJwk,
                }),
            ).toBe(false)
        })
    })

    describe('aes-gcm', () => {
        it('加密解密往返一致', async () => {
            const key = new Uint8Array(32).fill(7)
            const plaintext = utf8ToBytes('德育分申请数据')
            const { iv, ciphertext } = await aesGcmEncrypt(key, plaintext)
            const decrypted = await aesGcmDecrypt(key, iv, ciphertext)
            expect(decrypted).toEqual(plaintext)
        })

        it('指定 iv 时加密结果确定', async () => {
            const key = new Uint8Array(32).fill(1)
            const iv = new Uint8Array(12).fill(2)
            const plaintext = utf8ToBytes('deterministic')
            const a = await aesGcmEncrypt(key, plaintext, { iv })
            const b = await aesGcmEncrypt(key, plaintext, { iv })
            expect(a.ciphertext).toEqual(b.ciphertext)
        })

        it('篡改密文导致解密失败', async () => {
            const key = new Uint8Array(32).fill(3)
            const plaintext = utf8ToBytes('tamper me')
            const { iv, ciphertext } = await aesGcmEncrypt(key, plaintext)
            ciphertext[0] = ciphertext[0]! ^ 0xff
            await expect(aesGcmDecrypt(key, iv, ciphertext)).rejects.toThrow()
        })
    })

    describe('hybrid (.dyf)', () => {
        it('加密→解密往返，payload 与 hash 一致', async () => {
            const keyPair = await generateRsaKeyPair()
            const payload = {
                applyId: 'apply-001',
                revision: 1,
                batchId: 'batch-001',
                personal: { name: '张三', studentId: '20230001' },
                dyf: { '8882': { score: 2 } },
            }
            const file = await encryptPayload({
                payload,
                publicKeyJwk: keyPair.publicKeyJwk,
                type: 'apply',
                applyId: 'apply-001',
                revision: 1,
                batchId: 'batch-001',
            })

            expect(file.encrypted).toBe(true)
            expect(file.hash).toBeTruthy()
            expect(file.iv).toBeTruthy()
            expect(file.key).toBeTruthy()
            expect(file.data).toBeTruthy()

            const result = await decryptDyfFile({
                file,
                privateKeyJwk: keyPair.privateKeyJwk,
            })
            expect(result.type).toBe('apply')
            expect(result.payload).toEqual(payload)
            expect(result.hash).toBe(file.hash)
        })

        it('篡改 hash 导致完整性校验失败', async () => {
            const keyPair = await generateRsaKeyPair()
            const file = await encryptPayload({
                payload: { applyId: 'apply-002' },
                publicKeyJwk: keyPair.publicKeyJwk,
                type: 'apply',
            })
            file.hash = '0'.repeat(64)
            await expect(
                decryptDyfFile({ file, privateKeyJwk: keyPair.privateKeyJwk }),
            ).rejects.toThrow('完整性校验失败')
        })

        it('明文模式（encrypted=false）', async () => {
            const keyPair = await generateRsaKeyPair()
            const payload = { applyId: 'apply-003', personal: { name: '李四' } }
            const plainFile = {
                schemaVersion: 1,
                type: 'apply' as const,
                encrypted: false,
                data: JSON.stringify(payload),
                hash: await sha256Hex(utf8ToBytes(JSON.stringify(payload))),
            }
            const result = await decryptDyfFile({
                file: plainFile,
                privateKeyJwk: keyPair.privateKeyJwk,
            })
            expect(result.payload).toEqual(payload)
        })

        it('明文模式 hash 不匹配时抛错', async () => {
            const keyPair = await generateRsaKeyPair()
            const plainFile = {
                schemaVersion: 1,
                type: 'apply' as const,
                encrypted: false,
                data: JSON.stringify({ applyId: 'apply-004' }),
                hash: '0'.repeat(64),
            }
            await expect(
                decryptDyfFile({
                    file: plainFile,
                    privateKeyJwk: keyPair.privateKeyJwk,
                }),
            ).rejects.toThrow('完整性校验失败')
        })

        it('schemaVersion 无效时抛错', async () => {
            const keyPair = await generateRsaKeyPair()
            await expect(
                decryptDyfFile({
                    file: { schemaVersion: 0, type: 'apply', encrypted: true },
                    privateKeyJwk: keyPair.privateKeyJwk,
                }),
            ).rejects.toThrow('schemaVersion')
        })
    })

    describe('v2 binary container', () => {
        it('将 manifest 与重复资产分帧并完成完整性校验', async () => {
            const keyPair = await generateRsaKeyPair()
            const bytes = utf8ToBytes('same evidence')
            const hash = await sha256Hex(bytes)
            const payload = {
                documentType: 'student-application',
                applyId: 'apply-container-001',
                revision: 1,
                batchId: 'batch-container-001',
                personal: { name: '张三', studentId: '20260001' },
                dyf: { '1001': { score: 2, evidenceRefs: [`sha256:${hash}`] } },
            }
            const data = await encryptDyfContainer({
                payload,
                publicKeyJwk: keyPair.publicKeyJwk,
                type: 'apply',
                documentType: 'student-application',
                schemaVersion: 2,
                batchId: payload.batchId,
                assets: [
                    {
                        assetId: `sha256:${hash}`,
                        sha256: hash,
                        mimeType: 'text/plain',
                        size: bytes.length,
                        bytes,
                    },
                ],
                chunkSize: 1024,
            })
            const header = readDyfContainerHeader(data)
            expect(header.formatVersion).toBe(2)
            expect(header.assets).toHaveLength(1)
            expect(header.frameCount).toBeGreaterThan(1)
            const decoded = await decryptDyfContainer({ data, privateKeyJwk: keyPair.privateKeyJwk })
            expect(decoded.payload).toEqual(payload)
            expect(decoded.assets.get(`sha256:${hash}`)).toEqual(bytes)
            expect(decoded.fileHash).toHaveLength(64)
        })

        it('篡改任意资产帧会被拒绝', async () => {
            const keyPair = await generateRsaKeyPair()
            const bytes = utf8ToBytes('tamper')
            const hash = await sha256Hex(bytes)
            const data = await encryptDyfContainer({
                payload: { documentType: 'student-application', applyId: 'a', revision: 1, batchId: 'b', personal: { name: 'n', studentId: 's' }, dyf: {} },
                publicKeyJwk: keyPair.publicKeyJwk,
                type: 'apply',
                documentType: 'student-application',
                assets: [{ assetId: `sha256:${hash}`, sha256: hash, mimeType: 'text/plain', size: bytes.length, bytes }],
                chunkSize: 1024,
            })
            data[data.length - 1] = data[data.length - 1]! ^ 0xff
            await expect(decryptDyfContainer({ data, privateKeyJwk: keyPair.privateKeyJwk })).rejects.toThrow()
        })

        it('sink 编码器逐帧写出且产物可解密', async () => {
            const keyPair = await generateRsaKeyPair()
            const bytes = utf8ToBytes('streamed evidence')
            const hash = await sha256Hex(bytes)
            const payload = {
                documentType: 'admin-exchange',
                exchangeVersion: 2,
                batchId: 'batch-stream-001',
                year: 2026,
                semester: 1,
                fromRole: 'level3',
                fromScope: { grade: '2026', class: '1班' },
                exportedAt: Date.now(),
                students: [],
                applies: [],
                assets: [{ assetId: `sha256:${hash}`, sha256: hash, mimeType: 'text/plain', size: bytes.length }],
            }
            const parts: Uint8Array[] = []
            const progress: number[] = []
            const result = await encryptDyfContainerToSink({
                payload,
                publicKeyJwk: keyPair.publicKeyJwk,
                type: 'exchange',
                documentType: 'admin-exchange',
                assets: payload.assets,
                readAsset: async () => bytes,
                write: async (part) => {
                    parts.push(part.slice())
                },
                chunkSize: 1024,
                onProgress: (value) => progress.push(value.completed),
            })
            const output = concatTestBytes(parts)
            expect(result.frameCount).toBe(progress.length)
            expect(result.writtenBytes).toBe(output.length)
            const decoded = await decryptDyfContainer({ data: output, privateKeyJwk: keyPair.privateKeyJwk })
            expect(decoded.payload).toEqual(payload)
            expect(decoded.assets.get(`sha256:${hash}`)).toEqual(bytes)
        })

        it('sink 编码器支持外部 manifest 分块读取', async () => {
            const keyPair = await generateRsaKeyPair()
            const manifestText = JSON.stringify({
                documentType: 'admin-exchange',
                exchangeVersion: 2,
                batchId: 'batch-manifest-source',
                year: 2026,
                semester: 1,
                fromRole: 'level2',
                fromScope: { grade: '2026' },
                exportedAt: Date.now(),
                students: [],
                applies: [],
                assets: [],
            })
            const manifest = utf8ToBytes(manifestText)
            const sourceHash = await sha256Hex(manifest)
            const chunks: Uint8Array[] = []
            const result = await encryptDyfContainerToSink({
                publicKeyJwk: keyPair.publicKeyJwk,
                type: 'exchange',
                documentType: 'admin-exchange',
                assets: [],
                manifest: {
                    size: manifest.length,
                    contentHash: sourceHash,
                    readChunk: async (offset, maxBytes) => manifest.subarray(offset, offset + maxBytes),
                },
                readAsset: async () => new Uint8Array(0),
                write: async (part) => {
                    chunks.push(part.slice())
                },
                chunkSize: 1024,
            })
            const decoded = await decryptDyfContainer({
                data: concatTestBytes(chunks),
                privateKeyJwk: keyPair.privateKeyJwk,
            })
            expect(result.frameCount).toBeGreaterThan(0)
            expect(decoded.payload).toEqual(JSON.parse(manifestText))
        })

        it('source 解密器逐帧读取并把资产交给写入回调', async () => {
            const keyPair = await generateRsaKeyPair()
            const bytes = utf8ToBytes('source asset')
            const hash = await sha256Hex(bytes)
            const payload = {
                documentType: 'admin-exchange',
                exchangeVersion: 2,
                batchId: 'batch-source-001',
                year: 2026,
                semester: 1,
                fromRole: 'level3',
                fromScope: { grade: '2026', class: '1班' },
                exportedAt: Date.now(),
                students: [],
                applies: [],
                assets: [{ assetId: `sha256:${hash}`, sha256: hash, mimeType: 'text/plain', size: bytes.length }],
            }
            const encoded = await encryptDyfContainer({
                payload,
                publicKeyJwk: keyPair.publicKeyJwk,
                type: 'exchange',
                documentType: 'admin-exchange',
                assets: [{ assetId: `sha256:${hash}`, sha256: hash, mimeType: 'text/plain', size: bytes.length, bytes }],
                chunkSize: 1024,
            })
            const header = readDyfContainerHeader(encoded)
            const prefixLength = 12
            const assets = new Map<string, Uint8Array[]>()
            const decoded = await decryptDyfContainerFromSource({
                header,
                frameOffset: prefixLength + new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength).getUint32(8),
                totalSize: encoded.length,
                privateKeyJwk: keyPair.privateKeyJwk,
                read: async (offset, length) => encoded.subarray(offset, offset + length),
                writeAssetChunk: async (asset, _assetIndex, _offset, chunk) => {
                    const list = assets.get(asset.assetId) || []
                    list.push(chunk.slice())
                    assets.set(asset.assetId, list)
                },
            })
            expect(decoded.payload).toEqual(payload)
            expect(concatTestBytes(assets.get(`sha256:${hash}`) || [])).toEqual(bytes)
        })
    })
})

function concatTestBytes(parts: Uint8Array[]): Uint8Array {
    const size = parts.reduce((sum, part) => sum + part.length, 0)
    const output = new Uint8Array(size)
    let offset = 0
    for (const part of parts) {
        output.set(part, offset)
        offset += part.length
    }
    return output
}
