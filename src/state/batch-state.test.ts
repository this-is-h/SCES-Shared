import { describe, expect, it } from 'vitest'
import {
    BATCH_STATES,
    assertTransition,
    canTransition,
    isBatchState,
    nextStates,
} from './batch-state'

describe('batch 状态机', () => {
    it('状态集合完整', () => {
        expect(BATCH_STATES).toEqual(['draft', 'active', 'closed'])
    })

    it('合法迁移：draft → active → closed', () => {
        expect(canTransition('draft', 'active')).toBe(true)
        expect(canTransition('active', 'closed')).toBe(true)
        expect(() => assertTransition('draft', 'active')).not.toThrow()
    })

    it('非法迁移被拒绝', () => {
        expect(canTransition('draft', 'closed')).toBe(false)
        expect(canTransition('closed', 'active')).toBe(false)
        expect(canTransition('active', 'draft')).toBe(false)
    })

    it('assertTransition 非法时抛错', () => {
        expect(() => assertTransition('closed', 'draft')).toThrow('非法状态迁移')
    })

    it('nextStates 返回合法目标', () => {
        expect(nextStates('draft')).toEqual(['active'])
        expect(nextStates('closed')).toEqual([])
    })

    it('isBatchState 类型守卫', () => {
        expect(isBatchState('active')).toBe(true)
        expect(isBatchState('unknown')).toBe(false)
    })
})