import { describe, expect, it } from 'vitest'
import { calcRank } from './rank'

describe('calcRank', () => {
    const results = [
        { studentId: 's1', score: 90 },
        { studentId: 's2', score: 95 },
        { studentId: 's3', score: 90 },
        { studentId: 's4', score: 80 },
    ]

    it('默认同分同名次（1,2,2,4）', () => {
        const ranks = calcRank(results)
        expect(ranks).toEqual([
            { studentId: 's2', score: 95, rank: 1 },
            { studentId: 's1', score: 90, rank: 2 },
            { studentId: 's3', score: 90, rank: 2 },
            { studentId: 's4', score: 80, rank: 4 },
        ])
    })

    it('并列不跳号规则（1,2,2,3）', () => {
        const ranks = calcRank(results, { tieRule: 'dense' })
        expect(ranks).toEqual([
            { studentId: 's2', score: 95, rank: 1 },
            { studentId: 's1', score: 90, rank: 2 },
            { studentId: 's3', score: 90, rank: 2 },
            { studentId: 's4', score: 80, rank: 3 },
        ])
    })

    it('空输入 → 空结果', () => {
        expect(calcRank([])).toEqual([])
    })

    it('不修改原数组', () => {
        const input = [...results]
        calcRank(input)
        expect(input).toEqual(results)
    })

    it('全部同分时同名次', () => {
        const ranks = calcRank([
            { studentId: 'a', score: 60 },
            { studentId: 'b', score: 60 },
        ])
        expect(ranks.map((r) => r.rank)).toEqual([1, 1])
    })
})