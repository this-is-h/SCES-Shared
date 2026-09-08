/** 排名输入。 */
export interface RankInput {
    studentId: string
    score: number
}

import { nz, opt } from '../nullish'

/** 排名结果。 */
export interface RankResult {
    studentId: string
    score: number
    rank: number
}

/** 排名选项。 */
export interface RankOptions {
    /** 并列规则：same-rank 同分同名次跳号（1,2,2,4）/ dense 同分同名次不跳号（1,2,2,3）。默认 same-rank。 */
    tieRule?: 'same-rank' | 'dense'
}

/**
 * 计算排名：按 score 降序。
 * - same-rank：同分同名次，下一个不同分名次 = 已排人数 + 1。
 * - dense：同分同名次，下一个不同分名次顺延一位（名次不跳号）。
 */
export function calcRank(results: RankInput[], options?: RankOptions): RankResult[] {
    const tieRule = nz(opt(options, 'tieRule'), 'same-rank')
    const sorted = [...(Array.isArray(results) ? results : [])].sort((a, b) => b.score - a.score)
    const out: RankResult[] = []
    let sameRank = 0
    let denseRank = 0
    for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i]!
        const isFirst = i === 0
        const scoreChanged = !isFirst && item.score !== sorted[i - 1]!.score
        if (isFirst || scoreChanged) {
            sameRank = i + 1
            denseRank = (isFirst ? 0 : denseRank) + 1
        }
        out.push({
            studentId: item.studentId,
            score: item.score,
            rank: tieRule === 'dense' ? denseRank : sameRank,
        })
    }
    return out
}