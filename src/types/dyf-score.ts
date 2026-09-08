/** 德育分明细：学生申请/审核的德育分项目明细。 */
export interface DyfScore {
    /** 数据库自增 id（管理端本地）。 */
    id?: number
    applyId: string
    /** 项目编号。 */
    itemCode: string
    /** 类别（基础分/奖励分/惩罚分/...）。 */
    category: string
    /** 学生申请分。 */
    appliedScore: number
    /** 审核后分。 */
    finalScore?: number
    /** 上限。 */
    maxScore?: number
    /** 是否允许加分（默认不允许）。 */
    allowAdd: boolean
    /** 证明材料文件引用列表。 */
    evidenceFiles?: string[]
}