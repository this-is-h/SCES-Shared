import type {
    AesAlgorithm,
    DyfAssetDescriptor,
    DyfContainerHeader,
    DyfDocumentType,
    DyfFile,
    DyfFileType,
    Jwk,
    RsaAlgorithm,
} from '../types'
import { nz, opt } from '../nullish'
import { aesGcmDecrypt, aesGcmEncrypt } from './aes'
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from './encoding'
import { sha256Hex } from './hash'
import { getCryptoProvider } from './provider'
import { importRsaPrivateKey, importRsaPublicKey, rsaDecrypt, rsaEncrypt } from './rsa'

/** .dyf 文件格式版本。 */
export const DYF_SCHEMA_VERSION = 2
export const DYF_CONTAINER_MAGIC = 'DMSDYF2\0'
export const DYF_CONTAINER_VERSION = 2
export const DEFAULT_DYF_CHUNK_SIZE = 4 * 1024 * 1024

const DEFAULT_RSA: RsaAlgorithm = { name: 'RSA-OAEP', hash: 'SHA-256' }
const DEFAULT_AES: AesAlgorithm = { name: 'AES-GCM', length: 256 }

/** 加密 payload 的选项。 */
export interface EncryptPayloadOptions {
    payload: unknown
    /** 批次公钥（JWK）。 */
    publicKeyJwk: Jwk
    type: DyfFileType
    documentType?: DyfDocumentType
    applyId?: string
    revision?: number
    batchId?: string
    /** 加密所用申请公钥的 keyId(写入 DyfFile.keyId,管理端据此精确选私钥;决策 #45)。 */
    keyId?: string
    rsaAlgorithm?: RsaAlgorithm
    aesAlgorithm?: AesAlgorithm
    schemaVersion?: number
}

/** 解密 .dyf 文件的选项。 */
export interface DecryptDyfFileOptions {
    file: DyfFile
    /** 批次私钥（JWK）。 */
    privateKeyJwk: Jwk
    rsaAlgorithm?: RsaAlgorithm
}

/** 解密结果。 */
export interface DecryptResult {
    type: DyfFileType
    payload: unknown
    /** payload 的 SHA-256（hex）。 */
    hash: string
}

export interface DyfContainerAsset extends DyfAssetDescriptor {
    bytes: Uint8Array
}

export interface EncryptDyfContainerOptions extends EncryptPayloadOptions {
    /** 二进制资产正文；payload 中只应保存对应的 sha256:<hex> 引用。 */
    assets?: DyfContainerAsset[]
    chunkSize?: number
    onProgress?: (progress: { completed: number; total: number }) => void
}

export interface DecryptDyfContainerOptions {
    data: Uint8Array
    privateKeyJwk: Jwk
    rsaAlgorithm?: RsaAlgorithm
    onProgress?: (progress: { completed: number; total: number }) => void
}

export interface DecryptDyfContainerResult {
    type: DyfFileType
    documentType: DyfDocumentType
    payload: unknown
    /** manifest payload JSON 的 SHA-256。 */
    hash: string
    /** 完整二进制容器的 SHA-256，用于来源文件审计。 */
    fileHash: string
    assets: Map<string, Uint8Array>
    header: DyfContainerHeader
}

export interface DecryptDyfContainerFromSourceOptions {
    header: DyfContainerHeader
    frameOffset: number
    totalSize: number
    privateKeyJwk: Jwk
    rsaAlgorithm?: RsaAlgorithm
    read: (offset: number, length: number) => Promise<Uint8Array>
    writeAssetChunk: (
        asset: DyfAssetDescriptor,
        assetIndex: number,
        offset: number,
        chunk: Uint8Array,
    ) => Promise<void>
    validateAsset?: (asset: DyfAssetDescriptor, assetIndex: number) => Promise<void>
    writeManifestChunk?: (offset: number, chunk: Uint8Array) => Promise<void>
    onProgress?: (progress: { completed: number; total: number }) => void
}

export interface DecryptDyfContainerFromSourceResult {
    type: DyfFileType
    documentType: DyfDocumentType
    payload: unknown
    hash: string
    header: DyfContainerHeader
}

export interface EncryptDyfContainerToSinkOptions extends Omit<EncryptPayloadOptions, 'payload'> {
    payload?: unknown
    /** 只保存资产描述；资产正文由 readAsset 按资产逐个提供。 */
    assets?: Array<DyfAssetDescriptor>
    chunkSize?: number
    readAsset?: (assetId: string) => Promise<Uint8Array>
    /** Preferred for large assets: returns at most maxBytes from the requested offset. */
    readAssetChunk?: (assetId: string, offset: number, maxBytes: number) => Promise<Uint8Array>
    validateAsset?: (assetId: string) => Promise<void>
    write: (chunk: Uint8Array) => Promise<void>
    onProgress?: (progress: { completed: number; total: number; writtenBytes: number }) => void
    /** Optional pre-built manifest source. When present, payload is not stringified in memory. */
    manifest?: {
        size: number
        contentHash: string
        readChunk: (offset: number, maxBytes: number) => Promise<Uint8Array>
    }
}

export interface EncryptDyfContainerToSinkResult {
    header: DyfContainerHeader
    frameCount: number
    writtenBytes: number
}

function safeJsonParse(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch (e) {
        return undefined
    }
}

/**
 * 混合加密 payload，生成 .dyf 文件：
 *   AES-256-GCM 加密 payload（随机会话密钥）→ RSA-OAEP 加密会话密钥 → 内嵌 payload 的 SHA-256。
 */
export async function encryptPayload(options: EncryptPayloadOptions): Promise<DyfFile> {
    const { payload, publicKeyJwk, type, documentType, applyId, revision, batchId, keyId } = options
    const rsaAlgorithm = nz(options.rsaAlgorithm, DEFAULT_RSA)
    const aesAlgorithm = nz(options.aesAlgorithm, DEFAULT_AES)
    const schemaVersion = nz(options.schemaVersion, DYF_SCHEMA_VERSION)

    const plaintext = utf8ToBytes(JSON.stringify(payload))
    const hash = await sha256Hex(plaintext)

    const keyBytes = getCryptoProvider().randomBytes(32)
    const { iv, ciphertext } = await aesGcmEncrypt(keyBytes, plaintext)
    const publicKey = await importRsaPublicKey(publicKeyJwk, rsaAlgorithm)
    const encryptedKey = await rsaEncrypt(publicKey, keyBytes, rsaAlgorithm)

    return {
        schemaVersion,
        type,
        documentType,
        applyId,
        revision,
        batchId,
        keyId,
        encrypted: true,
        alg: { rsa: rsaAlgorithm, aes: aesAlgorithm },
        iv: bytesToBase64(iv),
        key: bytesToBase64(encryptedKey),
        data: bytesToBase64(ciphertext),
        hash,
    }
}

/**
 * 解密 .dyf 文件并校验完整性：
 *   RSA 解密会话密钥 → AES-GCM 解密 payload → 校验 SHA-256。
 * 支持明文模式（encrypted=false，如未启用加密的批次）。
 */
export async function decryptDyfFile(options: DecryptDyfFileOptions): Promise<DecryptResult> {
    const { file, privateKeyJwk } = options
    if (!file || typeof file.schemaVersion !== 'number' || file.schemaVersion < 1) {
        throw new Error('文件格式不正确：schemaVersion 无效')
    }
    if (!file.type) throw new Error('文件格式不正确：缺少 type')

    if (file.encrypted === false) {
        if (typeof file.data !== 'string') throw new Error('文件格式不正确：缺少 data')
        const hash = await sha256Hex(utf8ToBytes(file.data))
        if (file.hash && file.hash !== hash) throw new Error('文件完整性校验失败：hash 不匹配')
        const payload = safeJsonParse(file.data)
        if (payload === undefined) throw new Error('文件内容解析失败')
        return { type: file.type, payload, hash }
    }

    if (!file.iv || !file.key || !file.data) {
        throw new Error('文件格式不正确：缺少加密字段')
    }
    const rsaAlgorithm = nz(nz(options.rsaAlgorithm, opt(file.alg, 'rsa')), DEFAULT_RSA)
    const privateKey = await importRsaPrivateKey(privateKeyJwk, rsaAlgorithm)
    const keyBytes = await rsaDecrypt(privateKey, base64ToBytes(file.key), rsaAlgorithm)
    const plaintextBytes = await aesGcmDecrypt(
        keyBytes,
        base64ToBytes(file.iv),
        base64ToBytes(file.data),
    )
    const plaintext = bytesToUtf8(plaintextBytes)
    const hash = await sha256Hex(utf8ToBytes(plaintext))
    if (file.hash && file.hash !== hash) throw new Error('文件完整性校验失败：hash 不匹配')
    const payload = safeJsonParse(plaintext)
    if (payload === undefined) throw new Error('解密成功但内容解析失败')
    return { type: file.type, payload, hash }
}

const FRAME_HEADER_BYTES = 17
const FRAME_TAG_BYTES = 16
const MANIFEST_KIND = 0
const ASSET_KIND = 1
const NO_ASSET = 0xffffffff

function asciiBytes(value: string): Uint8Array {
    const out = new Uint8Array(value.length)
    for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff
    return out
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

function u32(value: number): Uint8Array {
    const out = new Uint8Array(4)
    new DataView(out.buffer).setUint32(0, value, false)
    return out
}

function readU32(data: Uint8Array, offset: number): number {
    if (offset < 0 || offset + 4 > data.length) throw new Error('DYF 二进制帧长度无效')
    return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, false)
}

function deriveFrameIv(baseIv: Uint8Array, frameIndex: number): Uint8Array {
    if (baseIv.length !== 12 || !Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex > 0xffffffff) {
        throw new Error('DYF 帧 nonce 参数无效')
    }
    const iv = baseIv.slice()
    new DataView(iv.buffer, iv.byteOffset, iv.byteLength).setUint32(8, frameIndex, false)
    return iv
}

function splitBytes(data: Uint8Array, chunkSize: number): Uint8Array[] {
    const chunks: Uint8Array[] = []
    if (data.length === 0) return [new Uint8Array(0)]
    for (let offset = 0; offset < data.length; offset += chunkSize) {
        chunks.push(data.subarray(offset, Math.min(offset + chunkSize, data.length)))
    }
    return chunks
}

function isMagic(data: Uint8Array): boolean {
    const magic = asciiBytes(DYF_CONTAINER_MAGIC)
    if (data.length < magic.length) return false
    for (let i = 0; i < magic.length; i++) if (data[i] !== magic[i]) return false
    return true
}

function parseContainerHeader(data: Uint8Array): { header: DyfContainerHeader; frameOffset: number } {
    const magicLength = DYF_CONTAINER_MAGIC.length
    if (!isMagic(data) || data.length < magicLength + 4) throw new Error('不是受支持的 v2 .dyf 二进制文件')
    const headerLength = readU32(data, magicLength)
    if (headerLength < 2 || headerLength > 16 * 1024 * 1024) throw new Error('DYF 头部长度无效')
    const frameOffset = magicLength + 4 + headerLength
    if (frameOffset > data.length) throw new Error('DYF 文件头部不完整')
    let header: unknown
    try {
        header = JSON.parse(bytesToUtf8(data.subarray(magicLength + 4, frameOffset)))
    } catch (error) {
        void error
        throw new Error('DYF 文件头部解析失败')
    }
    if (!header || typeof header !== 'object' || Array.isArray(header)) throw new Error('DYF 文件头部无效')
    const parsed = header as Partial<DyfContainerHeader>
    if (
        parsed.format !== 'dms-dyf' ||
        parsed.formatVersion !== DYF_CONTAINER_VERSION ||
        parsed.encrypted !== true ||
        parsed.algorithm !== 'AES-256-GCM-FRAME-v1' ||
        (parsed.documentType !== 'student-application' && parsed.documentType !== 'admin-exchange') ||
        (parsed.type !== 'apply' && parsed.type !== 'exchange')
    ) {
        throw new Error('DYF 文件格式版本或业务类型不受支持')
    }
    if (
        !Number.isInteger(parsed.chunkSize) ||
        parsed.chunkSize! < 1024 ||
        parsed.chunkSize! > 64 * 1024 * 1024 ||
        !Number.isInteger(parsed.frameCount) ||
        parsed.frameCount! < 1 ||
        !Number.isInteger(parsed.manifestFrameCount) ||
        parsed.manifestFrameCount! < 1 ||
        parsed.manifestFrameCount! > parsed.frameCount! ||
        !Array.isArray(parsed.assets) ||
        typeof parsed.contentHash !== 'string' ||
        !/^[0-9a-f]{64}$/.test(parsed.contentHash)
    ) {
        throw new Error('DYF 文件头部元数据无效')
    }
    for (const asset of parsed.assets) {
        if (
            !asset ||
            typeof asset !== 'object' ||
            typeof asset.assetId !== 'string' ||
            !/^sha256:[0-9a-f]{64}$/.test(asset.assetId) ||
            typeof asset.sha256 !== 'string' ||
            !/^[0-9a-f]{64}$/.test(asset.sha256) ||
            asset.assetId !== `sha256:${asset.sha256}` ||
            typeof asset.mimeType !== 'string' ||
            !Number.isInteger(asset.size) ||
            asset.size < 1 ||
            !Number.isInteger(asset.frameCount) ||
            asset.frameCount < 1
        ) {
            throw new Error('DYF 文件头部资产描述无效')
        }
    }
    return { header: parsed as DyfContainerHeader, frameOffset }
}

/** 仅读取 v2 头部，用于导入路由，不会解密或解析整个业务内容。 */
export function readDyfContainerHeader(data: Uint8Array): DyfContainerHeader {
    return parseContainerHeader(data).header
}

/** 生成 v2 二进制 .dyf 容器：manifest 与每个资产都按固定大小分帧并独立认证。 */
export async function encryptDyfContainer(options: EncryptDyfContainerOptions): Promise<Uint8Array> {
    const {
        payload,
        publicKeyJwk,
        type,
        documentType,
        applyId,
        revision,
        batchId,
        keyId,
        onProgress,
    } = options
    if (documentType !== 'student-application' && documentType !== 'admin-exchange') {
        throw new Error('v2 .dyf 必须指定 documentType')
    }
    const chunkSize = nz(opt(options, 'chunkSize'), DEFAULT_DYF_CHUNK_SIZE)
    if (!Number.isInteger(chunkSize) || chunkSize < 1024 || chunkSize > 64 * 1024 * 1024) {
        throw new Error('DYF chunkSize 必须位于 1 KiB 到 64 MiB 之间')
    }
    const assets = nz(opt(options, 'assets'), [])
    const descriptors: Array<DyfAssetDescriptor & { frameCount: number }> = []
    const seen = new Set<string>()
    const assetChunks: Uint8Array[][] = []
    for (const asset of assets) {
        if (!/^sha256:[0-9a-f]{64}$/.test(asset.assetId) || asset.assetId !== `sha256:${asset.sha256}`) {
            throw new Error(`DYF 资产标识无效：${asset.assetId}`)
        }
        if (seen.has(asset.assetId)) throw new Error(`DYF 包含重复资产：${asset.assetId}`)
        if (!(asset.bytes instanceof Uint8Array) || asset.bytes.length !== asset.size) {
            throw new Error(`DYF 资产大小校验失败：${asset.assetId}`)
        }
        const actual = await sha256Hex(asset.bytes)
        if (actual !== asset.sha256) throw new Error(`DYF 资产哈希校验失败：${asset.assetId}`)
        seen.add(asset.assetId)
        const chunks = splitBytes(asset.bytes, chunkSize)
        assetChunks.push(chunks)
        descriptors.push({
            assetId: asset.assetId,
            sha256: asset.sha256,
            mimeType: asset.mimeType,
            size: asset.size,
            frameCount: chunks.length,
        })
    }

    const manifest = utf8ToBytes(JSON.stringify(payload))
    const contentHash = await sha256Hex(manifest)
    const manifestChunks = splitBytes(manifest, chunkSize)
    const frameCount = manifestChunks.length + assetChunks.reduce((sum, chunks) => sum + chunks.length, 0)
    const keyBytes = getCryptoProvider().randomBytes(32)
    const baseIv = getCryptoProvider().randomBytes(12)
    const publicKey = await importRsaPublicKey(publicKeyJwk, DEFAULT_RSA)
    const encryptedKey = await rsaEncrypt(publicKey, keyBytes, DEFAULT_RSA)
    const header: DyfContainerHeader = {
        format: 'dms-dyf',
        formatVersion: DYF_CONTAINER_VERSION,
        type,
        documentType,
        encrypted: true,
        algorithm: 'AES-256-GCM-FRAME-v1',
        chunkSize,
        frameCount,
        manifestFrameCount: manifestChunks.length,
        contentHash,
        createdAt: Date.now(),
        key: bytesToBase64(encryptedKey),
        iv: bytesToBase64(baseIv),
        keyId,
        batchId,
        applyId,
        revision,
        assets: descriptors,
    }
    const headerBytes = utf8ToBytes(JSON.stringify(header))
    const frames: Uint8Array[] = []
    let frameIndex = 0
    const total = frameCount
    const writeFrame = async (kind: number, assetIndex: number, chunk: Uint8Array): Promise<void> => {
        const embedded = concatBytes(new Uint8Array([kind]), u32(frameIndex), chunk)
        const encrypted = await aesGcmEncrypt(keyBytes, embedded, { iv: deriveFrameIv(baseIv, frameIndex) })
        const frameHeader = concatBytes(new Uint8Array([kind]), u32(frameIndex), u32(assetIndex), u32(embedded.length), u32(encrypted.ciphertext.length))
        frames.push(concatBytes(frameHeader, encrypted.ciphertext))
        frameIndex++
        if (onProgress) onProgress({ completed: frameIndex, total })
    }
    for (const chunk of manifestChunks) await writeFrame(MANIFEST_KIND, NO_ASSET, chunk)
    for (let assetIndex = 0; assetIndex < assetChunks.length; assetIndex++) {
        for (const chunk of assetChunks[assetIndex]!) await writeFrame(ASSET_KIND, assetIndex, chunk)
    }
    return concatBytes(asciiBytes(DYF_CONTAINER_MAGIC), u32(headerBytes.length), headerBytes, ...frames)
}

/**
 * Writes a v2 container frame-by-frame. The caller owns the destination stream;
 * this function never materializes the complete archive in memory.
 */
export async function encryptDyfContainerToSink(
    options: EncryptDyfContainerToSinkOptions,
): Promise<EncryptDyfContainerToSinkResult> {
    const {
        payload,
        publicKeyJwk,
        type,
        documentType,
        applyId,
        revision,
        batchId,
        keyId,
        readAsset,
        readAssetChunk,
        write,
        onProgress,
        manifest: manifestSource,
    } = options
    if (documentType !== 'student-application' && documentType !== 'admin-exchange') {
        throw new Error('v2 .dyf 必须指定 documentType')
    }
    const chunkSize = nz(opt(options, 'chunkSize'), DEFAULT_DYF_CHUNK_SIZE)
    if (!Number.isInteger(chunkSize) || chunkSize < 1024 || chunkSize > 64 * 1024 * 1024) {
        throw new Error('DYF chunkSize 必须位于 1 KiB 到 64 MiB 之间')
    }
    const assets = nz(opt(options, 'assets'), [])
    if (!manifestSource && payload === undefined) throw new Error('DYF 缺少 manifest 或 payload')
    const manifest = manifestSource ? null : utf8ToBytes(JSON.stringify(payload))
    const manifestSize = manifestSource ? manifestSource.size : manifest!.length
    const contentHash = manifestSource ? manifestSource.contentHash : await sha256Hex(manifest!)
    const manifestFrameCount = Math.max(1, Math.ceil(manifestSize / chunkSize))
    const descriptors: Array<DyfAssetDescriptor & { frameCount: number }> = []
    const seen = new Set<string>()
    for (const asset of assets) {
        if (
            !/^sha256:[0-9a-f]{64}$/.test(asset.assetId) ||
            asset.assetId !== `sha256:${asset.sha256}` ||
            !Number.isInteger(asset.size) ||
            asset.size < 1
        ) {
            throw new Error(`DYF 资产描述无效：${asset.assetId}`)
        }
        if (seen.has(asset.assetId)) throw new Error(`DYF 包含重复资产：${asset.assetId}`)
        seen.add(asset.assetId)
        descriptors.push({
            ...asset,
            frameCount: Math.max(1, Math.ceil(asset.size / chunkSize)),
        })
    }
    const frameCount = manifestFrameCount + descriptors.reduce((sum, asset) => sum + asset.frameCount, 0)
    const keyBytes = getCryptoProvider().randomBytes(32)
    const baseIv = getCryptoProvider().randomBytes(12)
    const publicKey = await importRsaPublicKey(publicKeyJwk, DEFAULT_RSA)
    const encryptedKey = await rsaEncrypt(publicKey, keyBytes, DEFAULT_RSA)
    const header: DyfContainerHeader = {
        format: 'dms-dyf',
        formatVersion: DYF_CONTAINER_VERSION,
        type,
        documentType,
        encrypted: true,
        algorithm: 'AES-256-GCM-FRAME-v1',
        chunkSize,
        frameCount,
        manifestFrameCount,
        contentHash,
        createdAt: Date.now(),
        key: bytesToBase64(encryptedKey),
        iv: bytesToBase64(baseIv),
        keyId,
        batchId,
        applyId,
        revision,
        assets: descriptors,
    }
    const headerBytes = utf8ToBytes(JSON.stringify(header))
    let writtenBytes = 0
    const writePart = async (part: Uint8Array): Promise<void> => {
        await write(part)
        writtenBytes += part.length
    }
    await writePart(asciiBytes(DYF_CONTAINER_MAGIC))
    await writePart(u32(headerBytes.length))
    await writePart(headerBytes)

    let frameIndex = 0
    const writeFrame = async (kind: number, assetIndex: number, chunk: Uint8Array): Promise<void> => {
        const embedded = concatBytes(new Uint8Array([kind]), u32(frameIndex), chunk)
        const encrypted = await aesGcmEncrypt(keyBytes, embedded, { iv: deriveFrameIv(baseIv, frameIndex) })
        const frameHeader = concatBytes(
            new Uint8Array([kind]),
            u32(frameIndex),
            u32(assetIndex),
            u32(embedded.length),
            u32(encrypted.ciphertext.length),
        )
        await writePart(frameHeader)
        await writePart(encrypted.ciphertext)
        frameIndex++
        if (onProgress) onProgress({ completed: frameIndex, total: frameCount, writtenBytes })
    }
    for (let offset = 0; offset < manifestSize || (manifestSize === 0 && offset === 0); offset += chunkSize) {
        const chunk = manifestSource
            ? await manifestSource.readChunk(offset, Math.min(chunkSize, manifestSize - offset))
            : manifest!.subarray(offset, Math.min(offset + chunkSize, manifestSize))
        const expectedLength = Math.min(chunkSize, manifestSize - offset)
        if (manifestSize > 0 && chunk.length !== expectedLength) {
            throw new Error('DYF manifest 读取器返回了无效块')
        }
        await writeFrame(MANIFEST_KIND, NO_ASSET, chunk)
        if (manifestSize === 0) break
    }
    if (!readAsset && !readAssetChunk) throw new Error('DYF 缺少资产读取器')
    for (let assetIndex = 0; assetIndex < descriptors.length; assetIndex++) {
        const descriptor = descriptors[assetIndex]!
        if (readAssetChunk) {
            let offset = 0
            while (offset < descriptor.size) {
                const requested = Math.min(chunkSize, descriptor.size - offset)
                const chunk = await readAssetChunk(descriptor.assetId, offset, requested)
                if (chunk.length < 1 || chunk.length > requested) {
                    throw new Error(`DYF 资产读取器返回了无效块：${descriptor.assetId}`)
                }
                await writeFrame(ASSET_KIND, assetIndex, chunk)
                offset += chunk.length
            }
            if (offset !== descriptor.size) throw new Error(`DYF 资产大小校验失败：${descriptor.assetId}`)
            if (options.validateAsset) await options.validateAsset(descriptor.assetId)
        } else {
            const bytes = await readAsset!(descriptor.assetId)
            if (bytes.length !== descriptor.size || (await sha256Hex(bytes)) !== descriptor.sha256) {
                throw new Error(`DYF 资产完整性校验失败：${descriptor.assetId}`)
            }
            for (let offset = 0; offset < bytes.length; offset += chunkSize) {
                await writeFrame(ASSET_KIND, assetIndex, bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
            }
        }
    }
    return { header, frameCount, writtenBytes }
}

/** 解密并校验 v2 二进制 .dyf 容器；资产正文以 Uint8Array 返回，供导入阶段落盘。 */
export async function decryptDyfContainer(options: DecryptDyfContainerOptions): Promise<DecryptDyfContainerResult> {
    const { data, privateKeyJwk, onProgress } = options
    const { header, frameOffset } = parseContainerHeader(data)
    if (!header.key || !header.iv) throw new Error('DYF 文件缺少加密参数')
    const rsaAlgorithm = nz(options.rsaAlgorithm, DEFAULT_RSA)
    const privateKey = await importRsaPrivateKey(privateKeyJwk, rsaAlgorithm)
    const keyBytes = await rsaDecrypt(privateKey, base64ToBytes(header.key), rsaAlgorithm)
    const baseIv = base64ToBytes(header.iv)
    if (baseIv.length !== 12 || keyBytes.length !== 32) throw new Error('DYF 会话密钥参数无效')
    const manifestChunks: Uint8Array[] = []
    const assetChunks = new Map<number, Uint8Array[]>()
    let offset = frameOffset
    for (let sequence = 0; sequence < header.frameCount; sequence++) {
        if (offset + FRAME_HEADER_BYTES > data.length) throw new Error('DYF 文件帧不完整')
        const kind = data[offset]!
        const frameIndex = readU32(data, offset + 1)
        const assetIndex = readU32(data, offset + 5)
        const plainLength = readU32(data, offset + 9)
        const cipherLength = readU32(data, offset + 13)
        offset += FRAME_HEADER_BYTES
        if (
            frameIndex !== sequence ||
            (kind !== MANIFEST_KIND && kind !== ASSET_KIND) ||
            plainLength < 5 ||
            plainLength > header.chunkSize + 5 ||
            cipherLength !== plainLength + FRAME_TAG_BYTES ||
            offset + cipherLength > data.length
        ) throw new Error('DYF 文件帧元数据无效')
        const cipher = data.subarray(offset, offset + cipherLength)
        offset += cipherLength
        const embedded = await aesGcmDecrypt(keyBytes, deriveFrameIv(baseIv, frameIndex), cipher)
        if (embedded.length !== plainLength || embedded[0] !== kind || readU32(embedded, 1) !== frameIndex) {
            throw new Error('DYF 文件帧认证失败')
        }
        const chunk = embedded.subarray(5)
        if (kind === MANIFEST_KIND) {
            if (assetIndex !== NO_ASSET || sequence >= header.manifestFrameCount) throw new Error('DYF manifest 帧顺序无效')
            manifestChunks.push(chunk)
        } else {
            if (assetIndex >= header.assets.length) throw new Error('DYF 资产帧索引无效')
            const previous = assetChunks.get(assetIndex)
            const list = previous ? previous : []
            list.push(chunk)
            assetChunks.set(assetIndex, list)
        }
        if (onProgress) onProgress({ completed: sequence + 1, total: header.frameCount })
    }
    if (offset !== data.length || manifestChunks.length !== header.manifestFrameCount) throw new Error('DYF 文件包含多余或缺失帧')
    const manifestBytes = concatBytes(...manifestChunks)
    const hash = await sha256Hex(manifestBytes)
    if (hash !== header.contentHash) throw new Error('DYF manifest 完整性校验失败')
    let payload: unknown
    try {
        payload = JSON.parse(bytesToUtf8(manifestBytes))
    } catch (error) {
        void error
        throw new Error('DYF manifest 内容解析失败')
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('DYF manifest 内容无效')
    const payloadRecord = payload as Record<string, unknown>
    if (payloadRecord.documentType !== header.documentType) throw new Error('DYF 业务类型校验失败')
    const assets = new Map<string, Uint8Array>()
    for (let i = 0; i < header.assets.length; i++) {
        const descriptor = header.assets[i]!
        const previous = assetChunks.get(i)
        const chunks = previous ? previous : []
        if (chunks.length !== descriptor.frameCount) throw new Error(`DYF 资产帧数量不匹配：${descriptor.assetId}`)
        const bytes = concatBytes(...chunks)
        if (bytes.length !== descriptor.size || (await sha256Hex(bytes)) !== descriptor.sha256) {
            throw new Error(`DYF 资产完整性校验失败：${descriptor.assetId}`)
        }
        assets.set(descriptor.assetId, bytes)
    }
    return {
        type: header.type,
        documentType: header.documentType,
        payload,
        hash,
        fileHash: await sha256Hex(data),
        assets,
        header,
    }
}

/** Decrypts a file-like source one frame at a time and streams asset plaintext to the caller. */
export async function decryptDyfContainerFromSource(
    options: DecryptDyfContainerFromSourceOptions,
): Promise<DecryptDyfContainerFromSourceResult> {
    const { header, frameOffset, totalSize, privateKeyJwk, read, writeAssetChunk, onProgress } = options
    if (!header.key || !header.iv) throw new Error('DYF 文件缺少加密参数')
    const rsaAlgorithm = nz(options.rsaAlgorithm, DEFAULT_RSA)
    const privateKey = await importRsaPrivateKey(privateKeyJwk, rsaAlgorithm)
    const keyBytes = await rsaDecrypt(privateKey, base64ToBytes(header.key), rsaAlgorithm)
    const baseIv = base64ToBytes(header.iv)
    if (baseIv.length !== 12 || keyBytes.length !== 32) throw new Error('DYF 会话密钥参数无效')
    const manifestChunks: Uint8Array[] = []
    const assetOffsets = new Map<number, number>()
    const assetFrameCounts = new Map<number, number>()
    let lastAssetIndex = -1
    let manifestOffset = 0
    let offset = frameOffset
    for (let sequence = 0; sequence < header.frameCount; sequence++) {
        const frameHeader = await read(offset, FRAME_HEADER_BYTES)
        if (frameHeader.length !== FRAME_HEADER_BYTES) throw new Error('DYF 文件帧头不完整')
        const kind = frameHeader[0]!
        const frameIndex = readU32(frameHeader, 1)
        const assetIndex = readU32(frameHeader, 5)
        const plainLength = readU32(frameHeader, 9)
        const cipherLength = readU32(frameHeader, 13)
        offset += FRAME_HEADER_BYTES
        if (
            frameIndex !== sequence ||
            (kind !== MANIFEST_KIND && kind !== ASSET_KIND) ||
            plainLength < 5 ||
            plainLength > header.chunkSize + 5 ||
            cipherLength !== plainLength + FRAME_TAG_BYTES ||
            offset + cipherLength > totalSize
        ) throw new Error('DYF 文件帧元数据无效')
        const cipher = await read(offset, cipherLength)
        if (cipher.length !== cipherLength) throw new Error('DYF 文件帧正文不完整')
        offset += cipherLength
        const embedded = await aesGcmDecrypt(keyBytes, deriveFrameIv(baseIv, frameIndex), cipher)
        if (embedded.length !== plainLength || embedded[0] !== kind || readU32(embedded, 1) !== frameIndex) {
            throw new Error('DYF 文件帧认证失败')
        }
        const chunk = embedded.subarray(5)
        if (kind === MANIFEST_KIND) {
            if (assetIndex !== NO_ASSET || sequence >= header.manifestFrameCount) throw new Error('DYF manifest 帧顺序无效')
            manifestChunks.push(chunk)
            if (options.writeManifestChunk) await options.writeManifestChunk(manifestOffset, chunk)
            manifestOffset += chunk.length
        } else {
            if (assetIndex >= header.assets.length) throw new Error('DYF 资产帧索引无效')
            if (assetIndex < lastAssetIndex) throw new Error('DYF 资产帧顺序无效')
            lastAssetIndex = assetIndex
            const descriptor = header.assets[assetIndex]!
            const existingOffset = assetOffsets.get(assetIndex)
            const assetOffset = existingOffset === undefined ? 0 : existingOffset
            await writeAssetChunk(descriptor, assetIndex, assetOffset, chunk)
            assetOffsets.set(assetIndex, assetOffset + chunk.length)
            assetFrameCounts.set(assetIndex, (assetFrameCounts.get(assetIndex) || 0) + 1)
        }
        if (onProgress) onProgress({ completed: sequence + 1, total: header.frameCount })
    }
    if (offset !== totalSize || manifestChunks.length !== header.manifestFrameCount) throw new Error('DYF 文件包含多余或缺失帧')
    const manifestBytes = concatBytes(...manifestChunks)
    const hash = await sha256Hex(manifestBytes)
    if (hash !== header.contentHash) throw new Error('DYF manifest 完整性校验失败')
    let payload: unknown
    try {
        payload = JSON.parse(bytesToUtf8(manifestBytes))
    } catch (error) {
        void error
        throw new Error('DYF manifest 内容解析失败')
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('DYF manifest 内容无效')
    if ((payload as Record<string, unknown>).documentType !== header.documentType) throw new Error('DYF 业务类型校验失败')
    for (let index = 0; index < header.assets.length; index++) {
        const descriptor = header.assets[index]!
        const writtenValue = assetOffsets.get(index)
        const written = writtenValue === undefined ? 0 : writtenValue
        if (written !== descriptor.size) throw new Error(`DYF 资产大小校验失败：${descriptor.assetId}`)
        if ((assetFrameCounts.get(index) || 0) !== descriptor.frameCount) throw new Error(`DYF 资产帧数量不匹配：${descriptor.assetId}`)
        if (options.validateAsset) await options.validateAsset(descriptor, index)
    }
    return { type: header.type, documentType: header.documentType, payload, hash, header }
}
