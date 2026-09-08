import type { AesAlgorithm, RsaAlgorithm } from './common'

/** 文件类型：apply（学生申请）/ authorization（授权文件）/ exchange（管理端数据交换）。 */
export type DyfFileType = 'apply' | 'authorization' | 'exchange'

/** v2 德育分文件业务类型。扩展名统一为 .dyf，实际路由依赖该字段。 */
export type DyfDocumentType = 'student-application' | 'admin-exchange'

/**
 * 申请文件（.dyf）格式（架构 §5.1）：
 * - 机密性：RSA 公钥加密会话密钥，仅持有批次私钥的管理端可解密。
 * - 完整性：内嵌 hash（payload 的 SHA-256），管理端解密后校验。
 * - 防重放：applyId 唯一 + 服务端记录已导入的 applyId。
 */
export interface DyfFile {
    /** 文件格式版本。 */
    schemaVersion: number
    type: DyfFileType
    /** v2 必填：学生申请或管理端交换。 */
    documentType?: DyfDocumentType
    /** 申请唯一标识（防重放）。 */
    applyId?: string
    /** 申请版本号。 */
    revision?: number
    batchId?: string
    /** 加密所用申请公钥的 keyId（管理端据此精确选私钥；决策 #45 / M-O3 任务 3.10）。 */
    keyId?: string
    /** 是否加密。 */
    encrypted: boolean
    /** 加密算法参数（encrypted 时存在）。 */
    alg?: { rsa: RsaAlgorithm; aes: AesAlgorithm }
    /** AES-GCM 初始化向量（base64）。 */
    iv?: string
    /** RSA 加密后的会话密钥（base64）。 */
    key?: string
    /** AES 密文（base64）或明文 payload JSON（encrypted=false 时）。 */
    data?: string
    /** payload 的 SHA-256（hex）。 */
    hash?: string
}

/** v2 二进制容器中的资产描述。资产正文位于后续二进制帧，不嵌入 JSON。 */
export interface DyfAssetDescriptor {
    assetId: string
    sha256: string
    mimeType: string
    size: number
}

/** v2 .dyf 容器头部。头部保持小且可快速读取，业务内容和资产在帧中。 */
export interface DyfContainerHeader {
    format: 'dms-dyf'
    formatVersion: 2
    type: DyfFileType
    documentType: DyfDocumentType
    encrypted: true
    algorithm: 'AES-256-GCM-FRAME-v1'
    chunkSize: number
    frameCount: number
    manifestFrameCount: number
    contentHash: string
    createdAt: number
    key?: string
    iv?: string
    keyId?: string
    batchId?: string
    applyId?: string
    revision?: number
    assets: Array<DyfAssetDescriptor & { frameCount: number }>
}
