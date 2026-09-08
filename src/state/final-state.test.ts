import { describe, expect, it } from 'vitest'
import {
    FINAL_STATES,
    assertTransition,
    canTransition,
    isFinalState,
    nextStates,
} from './final-state'

describe('final 状态机', () => {
    it('状态集合完整', () => {
        expect(FINAL_STATES).toEqual(['course_uploaded', 'final_confirmed'])
    })

    it('合法迁移：course_uploaded → final_confirmed', () => {
        expect(canTransition('course_uploaded', 'final_confirmed')).toBe(true)
        expect(() => assertTransition('course_uploaded', 'final_confirmed')).not.toThrow()
    })

    it('非法迁移被拒绝', () => {
        expect(canTransition('final_confirmed', 'course_uploaded')).toBe(false)
        expect(canTransition('course_uploaded', 'course_uploaded')).toBe(false)
    })

    it('assertTransition 非法时抛错', () => {
        expect(() => assertTransition('final_confirmed', 'course_uploaded')).toThrow(
            '非法状态迁移',
        )
    })

    it('nextStates 返回合法目标', () => {
        expect(nextStates('course_uploaded')).toEqual(['final_confirmed'])
        expect(nextStates('final_confirmed')).toEqual([])
    })

    it('isFinalState 类型守卫', () => {
        expect(isFinalState('course_uploaded')).toBe(true)
        expect(isFinalState('unknown')).toBe(false)
    })
})