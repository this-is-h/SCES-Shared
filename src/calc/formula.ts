import type { CalcConfig, DyfScore } from '../types'
import type { DyfTotalConfig } from './dyf-total'
import type { CalcEngine } from './engine'
import type { RankInput, RankOptions, RankResult } from './rank'

/**
 * 公式实现（预留，架构 §8.1）。
 * 表达式解析器（如 mathjs 子集）在 M4 综测计算里程碑接入，
 * 配置 `calc_config.formula`。当前仅占位，调用即抛错。
 */
export class FormulaCalc implements CalcEngine {
    calcDyfTotal(_scores: DyfScore[], _config?: DyfTotalConfig): number {
        throw new Error('formula 模式尚未实现：德育分总分请使用 WeightedCalc')
    }

    calcFinalTotal(_dyfTotal: number, _courseTotal: number, _config: CalcConfig): number {
        throw new Error('formula 模式尚未实现：请配置 calc_config.formula 表达式')
    }

    calcRank(_results: RankInput[], _options?: RankOptions): RankResult[] {
        throw new Error('formula 模式尚未实现：排名请使用 WeightedCalc')
    }
}