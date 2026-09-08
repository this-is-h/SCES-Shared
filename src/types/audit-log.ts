import type { EpochMs } from './common'

/** 管理端角色：level1（一级/单位管理员）/ level2（二级/年级管理员）/ level3（三级/班长）。 */
export type AuditRole = 'level1' | 'level2' | 'level3'

/** 审计日志：所有写操作必须落审计。 */
export interface AuditLog {
    /** 数据库自增 id（管理端本地）。 */
    id?: number
    batchId?: string
    /** 操作者。 */
    operator: string
    role: AuditRole
    /** 数据范围（class/grade/unit）。 */
    scope: string
    /** 操作类型（如 import / review / confirm / lock / correct）。 */
    action: string
    /** 操作目标（如 applyId / studentId）。 */
    target?: string
    /** 变更前后 JSON。 */
    detail?: unknown
    createdAt: EpochMs
}