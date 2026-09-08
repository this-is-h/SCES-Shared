import type { EpochMs } from './common'

/** 申请版本：申请的快照，每次导出生成。 */
export interface Revision {
    applyId: string
    /** 递增版本号。 */
    revision: number
    /** 该版本文件内容的 SHA-256。 */
    fileHash: string
    createdAt: EpochMs
}