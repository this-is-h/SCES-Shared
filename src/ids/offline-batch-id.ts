/**
 * 确定性批次 id 派生。
 *
 * 为什么需要：离线模式下学生端小程序在**编译期**就要知道 batchId（配置随包下发），
 * 而管理端在**运行期**创建批次。两端必须算出同一个 id，否则
 * `SCES-Management-Desktop-Electron/src/main/services/import.ts` 的 `payload.batchId !== batch.batchId`
 * 硬校验永远不成立，`.dyf` 永远导不进去。
 *
 * 为什么是 UUIDv8 而不是 v5：v5 要求 SHA-1，而 `CryptoProvider` 只暴露 SHA-256
 * （加 SHA-1 要动小程序侧的 vendor 打包）。RFC 9562 的 v8 正是"自定义派生"的版本位，
 * 允许前 16 字节任意来源，恰好合用。
 *
 * 本模块**镜像进小程序**（只依赖 `CryptoProvider.sha256`）。
 */
import { utf8ToBytes } from '../crypto/encoding'
import { bytesToHex, sha256Bytes } from '../crypto/hash'

/** 派生输入：唯一确定一个批次的四元组 + 同学期内序号。 */
export interface OfflineBatchIdInput {
    unitId: string
    year: number
    /** 学期：1 | 2 */
    semester: number
    /** 测试批次与正式批次即使同学期也必须是不同批次 */
    isTest: boolean
    /** 同 (unitId, year, semester, isTest) 下的第几个批次，从 1 开始 */
    seq: number
}

/** 派生前缀。改动它会让所有历史批次 id 变化，等同于一次不兼容升级。 */
export const OFFLINE_BATCH_ID_PREFIX = 'dys-offline-batch:v1'

/** 派生种子串。独立导出，便于构建脚本与管理端在排障时逐字符比对。 */
export function offlineBatchIdSeed(input: OfflineBatchIdInput): string {
    const flag = input.isTest ? 't' : 'f'
    return `${OFFLINE_BATCH_ID_PREFIX}:${input.unitId}:${input.year}:${input.semester}:${flag}:${input.seq}`
}

/** 派生 batchId（RFC 9562 UUIDv8 形态，两端结果逐字符一致）。 */
export async function deriveOfflineBatchId(input: OfflineBatchIdInput): Promise<string> {
    const digest = await sha256Bytes(utf8ToBytes(offlineBatchIdSeed(input)))
    const bytes = digest.slice(0, 16)
    // version = 8（RFC 9562 自定义派生），variant = 0b10（RFC 4122 兼容）
    bytes[6] = (bytes[6]! & 0x0f) | 0x80
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = bytesToHex(bytes)
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
