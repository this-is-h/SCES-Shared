/**
 * 加减分权限判定（权限矩阵 §6.2）。
 * - 扣分（finalScore < appliedScore）：一级/二级/三级均可；
 * - 加分（finalScore > appliedScore）：
 *   - 学生申请项（studentApplicable）：防止管理端抬高学生自报分——一级对所有项可，二级仅「允许加分」(allowAdd) 项，三级不可；
 *   - 非学生申请项（管理端补录，如基础分，基线 appliedScore=0）：属数据录入而非加分，任何角色都可。
 */
import type { AuditRole, DyfItem } from '../types'

/** 分数调整方向。 */
export type ScoreAdjustDirection = 'deduct' | 'add'

/**
 * 学生端可申请项目的兼容回退类别（旧版预览版 config.js 的
 * `studentRequiredCategories`，服务端下发 `studentApplicable` 标记后不再依赖）。
 * 参考：`web/public/configs/config.js`（已过时，仅作限制条件语义参考）。
 */
export const LEGACY_STUDENT_APPLICABLE_CATEGORIES: string[] = ['奖励分', '第八项第三条']

/** 学生端可申请项目的兼容回退编号（旧版 `studentRequiredExtraItemNumbers`：313 四六级 / 521 校园活动）。 */
export const LEGACY_STUDENT_APPLICABLE_ITEM_CODES: string[] = ['313', '521']

/**
 * 判定项目是否学生端可申请（审核页两栏布局：左=学生端不可申请/管理端项目，右=学生端可申请）。
 * 优先使用模板下发的 `studentApplicable` 标记；缺省时按旧版 config.js 规则回退
 * （类别名命中「奖励分/第八项第三条」，或编号命中 313/521）。
 */
export function isStudentApplicableItem(item: DyfItem, categoryName: string): boolean {
    if (item.studentApplicable !== undefined) return item.studentApplicable
    if (LEGACY_STUDENT_APPLICABLE_CATEGORIES.includes(categoryName)) return true
    return LEGACY_STUDENT_APPLICABLE_ITEM_CODES.includes(String(item.code))
}

/** 加减分权限判定。 */
export function canAdjustScore(options: {
    /** 操作者角色。 */
    role: AuditRole
    /** 项目是否允许加分（配置模板）。 */
    allowAdd: boolean
    /** 调整方向：deduct 扣分 / add 加分。 */
    direction: ScoreAdjustDirection
    /** 该项目是否学生端可申请：加分限制仅对学生申请项生效（防止抬高学生自报分）。 */
    studentApplicable: boolean
}): boolean {
    const { role, allowAdd, direction, studentApplicable } = options
    if (direction === 'deduct') return true
    // 非学生申请项（管理端补录，如基础分）：属数据录入，不受加分限制，否则基线 0 会把补录误判为加分而封锁
    if (!studentApplicable) return true
    if (role === 'level1') return true
    if (role === 'level2') return allowAdd
    return false
}

/** 判断分数调整方向：低于申请分 → 扣分；高于申请分 → 加分；相等 → 不变。 */
export function adjustDirection(
    appliedScore: number,
    finalScore: number,
): ScoreAdjustDirection | 'keep' {
    if (finalScore < appliedScore) return 'deduct'
    if (finalScore > appliedScore) return 'add'
    return 'keep'
}
