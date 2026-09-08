import type { CalcConfig, DyfScore } from '../types'
import type { DyfTotalConfig } from './dyf-total'
import type { RankInput, RankOptions, RankResult } from './rank'

/**
 * 计算引擎接口（架构 §8.1）。
 * 当前实现 `weighted`（加权）；`formula`（公式）预留，可平滑接入。
 */
export interface CalcEngine {
    /**
     * 德育分总分 = Σ（各项目审核后分）。penalty 分类小计取负、negative 条目单项取负，
     * 由 config 的标记 code 列表决定（决策 #36，标记驱动）；不传则不识别任何 penalty/negative。
     */
    calcDyfTotal(scores: DyfScore[], config?: DyfTotalConfig): number
    /** 综测总分 = 计算引擎输出（weighted：加权求和；formula：表达式）。 */
    calcFinalTotal(dyfTotal: number, courseTotal: number, config: CalcConfig): number
    /**
     * 排名计算。调用方已按 scope（class/major/grade/school）分组传入，
     * 本方法仅负责组内排序与名次。
     */
    calcRank(results: RankInput[], options?: RankOptions): RankResult[]
}

export type { RankInput, RankOptions, RankResult } from './rank'
export { calcDyfTotal } from './dyf-total'
export { calcRank } from './rank'