/** 批次状态机：draft（草稿）→ active（进行中）→ closed（已结束），单向推进。 */
export const BATCH_STATES = ['draft', 'active', 'closed'] as const
export type BatchState = (typeof BATCH_STATES)[number]

import { nz } from '../nullish'

export const BATCH_TRANSITIONS: Record<BatchState, readonly BatchState[]> = {
    draft: ['active'],
    active: ['closed'],
    closed: [],
}

/** 判断状态迁移是否合法。 */
export function canTransition(from: BatchState, to: BatchState): boolean {
    return nz(BATCH_TRANSITIONS[from], []).includes(to)
}

/** 判断状态迁移合法，非法时抛错。 */
export function assertTransition(from: BatchState, to: BatchState): void {
    if (!canTransition(from, to)) {
        throw new Error(`非法状态迁移：${from} → ${to}`)
    }
}

/** 返回某状态可到达的所有目标状态。 */
export function nextStates(from: BatchState): readonly BatchState[] {
    return nz(BATCH_TRANSITIONS[from], [])
}

/** 判断字符串是否为合法批次状态。 */
export function isBatchState(value: unknown): value is BatchState {
    return typeof value === 'string' && (BATCH_STATES as readonly string[]).includes(value)
}