import { describe, expect, it } from 'vitest'
import { WeightedCalc } from './weighted'
import type { DyfScore } from '../types'

describe('WeightedCalc', () => {
    const calc = new WeightedCalc()

    describe('calcDyfTotal', () => {
        it('用 finalScore 优先，回退 appliedScore', () => {
            const scores: DyfScore[] = [
                {
                    applyId: 'a1',
                    itemCode: '1001',
                    category: '基础分',
                    appliedScore: 5,
                    finalScore: 4,
                    allowAdd: false,
                },
                {
                    applyId: 'a1',
                    itemCode: '1002',
                    category: '基础分',
                    appliedScore: 3,
                    allowAdd: false,
                },
            ]
            expect(calc.calcDyfTotal(scores)).toBe(7)
        })

        it('惩罚分类目为负（penalty code 由 config 提供，标记驱动）', () => {
            const scores: DyfScore[] = [
                {
                    applyId: 'a1',
                    itemCode: '1001',
                    category: 'base',
                    appliedScore: 10,
                    allowAdd: false,
                },
                {
                    applyId: 'a1',
                    itemCode: '9001',
                    category: 'penalty',
                    appliedScore: 2,
                    allowAdd: false,
                },
            ]
            expect(calc.calcDyfTotal(scores, { penaltyCategoryCodes: ['penalty'] })).toBe(8)
        })
    })

    describe('calcFinalTotal', () => {
        it('加权求和', () => {
            expect(
                calc.calcFinalTotal(80, 90, { dyfWeight: 0.3, courseWeight: 0.7 }),
            ).toBe(87)
        })

        it('结果保留两位小数', () => {
            expect(
                calc.calcFinalTotal(80.1, 90.2, { dyfWeight: 0.3, courseWeight: 0.7 }),
            ).toBe(87.17)
        })
    })

    describe('calcRank', () => {
        it('委托给 calcRank', () => {
            const ranks = calc.calcRank([
                { studentId: 'a', score: 90 },
                { studentId: 'b', score: 80 },
            ])
            expect(ranks).toEqual([
                { studentId: 'a', score: 90, rank: 1 },
                { studentId: 'b', score: 80, rank: 2 },
            ])
        })
    })
})