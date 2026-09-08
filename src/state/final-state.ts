/** 综测状态机：course_uploaded（课程成绩已上传）→ final_confirmed（综测已确认），单向推进。 */
export const FINAL_STATES = ['course_uploaded', 'final_confirmed'] as const
export type FinalState = (typeof FINAL_STATES)[number]

import { nz } from '../nullish'

export const FINAL_TRANSITIONS: Record<FinalState, readonly FinalState[]> = {
    course_uploaded: ['final_confirmed'],
    final_confirmed: [],
}

/** 判断状态迁移是否合法。 */
export function canTransition(from: FinalState, to: FinalState): boolean {
    return nz(FINAL_TRANSITIONS[from], []).includes(to)
}

/** 判断状态迁移合法，非法时抛错。 */
export function assertTransition(from: FinalState, to: FinalState): void {
    if (!canTransition(from, to)) {
        throw new Error(`非法状态迁移：${from} → ${to}`)
    }
}

/** 返回某状态可到达的所有目标状态。 */
export function nextStates(from: FinalState): readonly FinalState[] {
    return nz(FINAL_TRANSITIONS[from], [])
}

/** 判断字符串是否为合法综测状态。 */
export function isFinalState(value: unknown): value is FinalState {
    return typeof value === 'string' && (FINAL_STATES as readonly string[]).includes(value)
}