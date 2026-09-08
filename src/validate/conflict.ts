import type { ApplyStatus } from '../types'

/** 导入判定结果：accept 正常导入 / reject 直接拒绝 / conflict 需管理端处理冲突。 */
export type ImportDecision = 'accept' | 'reject' | 'conflict'

/** 已存在的学生记录（管理端本地）。 */
export interface ExistingStudent {
    studentId: string
    name: string
    /** 学号冲突锁定（只能设置一次）。 */
    idConflictLocked: boolean
    /** 姓名已修正（仅一次）。 */
    nameCorrected: boolean
    /** 该学号申请的当前状态（用于重复导入判定）。 */
    applyStatus?: ApplyStatus
}

/** 导入检查输入。 */
export interface ImportCheckInput {
    studentId: string
    name: string
    applyId?: string
    /** 已存在的学生记录；不存在表示首次导入。 */
    existing?: ExistingStudent
}

/** 导入检查结果。 */
export interface ImportCheckResult {
    decision: ImportDecision
    reason?: string
}

/**
 * 学号冲突与可疑导入判定（架构 §7.2 / §7.3）：
 * 1. 首次导入（学号不存在）→ accept。
 * 2. 学号+姓名均一致 → 重复导入，拒绝（不覆盖首次数据）。
 * 3. 学号同、姓名不同：
 *    - 学号已锁定（idConflictLocked）→ 拒绝。
 *    - 姓名已修正（nameCorrected）→ 拒绝。
 *    - 否则 → conflict，需管理端处理（只能设置一次）。
 */
export function checkImport(input: ImportCheckInput): ImportCheckResult {
    const { existing } = input
    if (!existing) return { decision: 'accept' }

    if (existing.name === input.name) {
        const inReview =
            existing.applyStatus !== undefined &&
            existing.applyStatus !== 'draft' &&
            existing.applyStatus !== 'submitted'
        return {
            decision: 'reject',
            reason: inReview
                ? '重复导入：该申请已进入审核阶段'
                : '重复导入：同一学号与姓名已存在',
        }
    }

    if (existing.idConflictLocked) {
        return { decision: 'reject', reason: '学号已锁定，姓名与锁定记录不符' }
    }
    if (existing.nameCorrected) {
        return { decision: 'reject', reason: '姓名已修正，与修正后记录不符' }
    }
    return { decision: 'conflict', reason: '学号冲突：学号相同但姓名不同，需管理端处理' }
}