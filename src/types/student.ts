import type { EpochMs } from './common'

/** 学生：批次内的学生记录，学号为批次内唯一键。 */
export interface Student {
    /** 数据库自增 id（管理端本地）。 */
    id?: number
    batchId: string
    /** 学号（批次内唯一键）。 */
    studentId: string
    name: string
    phone?: string
    grade?: string
    major?: string
    className?: string
    /** 学号冲突锁定（只能设置一次，不可撤销）。 */
    idConflictLocked: boolean
    /** 姓名已修正（仅一次）。 */
    nameCorrected: boolean
    createdAt?: EpochMs
    updatedAt?: EpochMs
}