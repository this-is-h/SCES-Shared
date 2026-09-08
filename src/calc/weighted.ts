import type { CalcConfig, DyfScore } from '../types'
import { nz, opt } from '../nullish'
import { calcDyfTotal } from './dyf-total'
import type { DyfTotalConfig } from './dyf-total'
import type { CalcEngine } from './engine'
import { calcRank } from './rank'
import type { RankInput, RankOptions, RankResult } from './rank'

/**
 * 加权计算实现（当前 calcMode = weighted）。
 * 综测总分 = 德育分 × dyfWeight + 课程成绩 × courseWeight。
 */
export class WeightedCalc implements CalcEngine {
    calcDyfTotal(scores: DyfScore[], config?: DyfTotalConfig): number {
        const list = Array.isArray(scores) ? scores : []
        return calcDyfTotal(
            list.map((s) => ({
                categoryCode: String(nz(opt(s, 'category'), '')),
                itemNumber: String(nz(opt(s, 'itemCode'), '')),
                score: Number(nz(nz(opt(s, 'finalScore'), opt(s, 'appliedScore')), 0)),
            })),
            config,
        )
    }

    calcFinalTotal(dyfTotal: number, courseTotal: number, config: CalcConfig): number {
        const dyfWeight = Number(nz(opt(config, 'dyfWeight'), 0))
        const courseWeight = Number(nz(opt(config, 'courseWeight'), 0))
        return Number((dyfTotal * dyfWeight + courseTotal * courseWeight).toFixed(2))
    }

    calcRank(results: RankInput[], options?: RankOptions): RankResult[] {
        return calcRank(results, options)
    }
}