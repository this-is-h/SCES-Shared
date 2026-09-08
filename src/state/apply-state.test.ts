import { describe, expect, it } from 'vitest'
import {
    APPLY_STATES,
    APPLY_TRANSITIONS,
    assertTransition,
    canTransition,
    isApplyState,
    nextStates,
} from './apply-state'

describe('apply 状态机', () => {
    it('状态集合完整', () => {
        expect(APPLY_STATES).toEqual([
            'draft',
            'submitted',
            'imported',
            'reviewing',
            'confirmed',
        ])
    })

    it('合法迁移：draft → submitted', () => {
        expect(canTransition('draft', 'submitted')).toBe(true)
        expect(() => assertTransition('draft', 'submitted')).not.toThrow()
    })

    it('submitted 可重新导出（自环）', () => {
        expect(canTransition('submitted', 'submitted')).toBe(true)
    })

    it('完整链路单向推进', () => {
        expect(canTransition('draft', 'submitted')).toBe(true)
        expect(canTransition('submitted', 'imported')).toBe(true)
        expect(canTransition('imported', 'reviewing')).toBe(true)
        expect(canTransition('reviewing', 'confirmed')).toBe(true)
    })

    it('非法迁移被拒绝', () => {
        expect(canTransition('draft', 'imported')).toBe(false)
        expect(canTransition('imported', 'submitted')).toBe(false)
        expect(canTransition('confirmed', 'reviewing')).toBe(false)
        expect(canTransition('confirmed', 'draft')).toBe(false)
    })

    it('assertTransition 非法时抛错', () => {
        expect(() => assertTransition('confirmed', 'draft')).toThrow('非法状态迁移')
    })

    it('nextStates 返回合法目标', () => {
        expect(nextStates('draft')).toEqual(['submitted'])
        expect(nextStates('submitted')).toEqual(['submitted', 'reviewing', 'imported'])
        expect(nextStates('confirmed')).toEqual([])
    })

    it('isApplyState 类型守卫', () => {
        expect(isApplyState('imported')).toBe(true)
        expect(isApplyState('unknown')).toBe(false)
        expect(isApplyState(123)).toBe(false)
    })

    it('迁移表覆盖所有状态', () => {
        for (const state of APPLY_STATES) {
            expect(APPLY_TRANSITIONS[state]).toBeDefined()
        }
    })
})
