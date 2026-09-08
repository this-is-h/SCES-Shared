import type { EpochMs, Jwk } from './common'

/** 批次状态：draft（未开放）→ active（进行中）→ closed（已结束）。 */
export type BatchStatus = 'draft' | 'active' | 'closed'

/** 批次状态中文标签（面向用户统一展示，三端共用，避免各端文案漂移）。 */
export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
    draft: '未开放',
    active: '进行中',
    closed: '已结束',
}

/** 计算模式：weighted（加权，当前）/ formula（公式，预留）。 */
export type CalcMode = 'weighted' | 'formula'

/** 排名范围：class（班级）/ major（专业）/ grade（年级）/ school（全校）/ all（全部）。 */
export type RankScope = 'class' | 'major' | 'grade' | 'school' | 'all'

/** 计算配置。weighted 模式用权重；formula 模式用表达式（预留）。 */
export interface CalcConfig {
    /** 计算模式（由服务端模板下发，缺省按 weighted 处理）。 */
    calcMode?: CalcMode
    /** 德育分权重（weighted 模式）。 */
    dyfWeight: number
    /** 课程成绩权重（weighted 模式）。 */
    courseWeight: number
    /** 自定义公式（formula 模式预留）。 */
    formula?: string
}

/** 批次：一次综测周期（一个学年学期）的完整配置，由一级管理端创建。 */
export interface Batch {
    /** 批次唯一标识（UUID）。 */
    batchId: string
    /** 学年。 */
    year: number
    /** 学期（1/2）。 */
    semester: 1 | 2
    /** 是否测试批次（试用/演示，不污染正式数据；同时仅允许一个进行中）。 */
    isTest?: boolean
    status: BatchStatus
    /** 申请开始时间。 */
    applyStartAt?: EpochMs
    /** 申请结束时间。 */
    applyEndAt?: EpochMs
    /** 引用的配置模板 id。 */
    configTemplateId?: string
    calcMode: CalcMode
    calcConfig: CalcConfig
    /** 排名范围（可多选）。 */
    rankScope: RankScope | RankScope[]
    /**
     * 班级端审核完成时间（整班导出，决策 #17）。
     * 设置后本端锁定：不可再导入/修改/处理冲突；导入时校验学生是否已被标记为班级端审核。
     */
    classReviewedAt?: EpochMs
    /**
     * 排名计算时间（决策 #47：手动计算排名）。null = 尚未计算；
     * 与 scoresChangedAt 比较判定排名是否为最新（stale 时禁止导出）。
     */
    rankedAt?: EpochMs
    /** 分数/名单最近变更时间（导入/改分/补全/冲突处理时更新，用于判定排名是否过期）。 */
    scoresChangedAt?: EpochMs
    /** 最近一次成功保存公示表格的时间；早于 scoresChangedAt 时视为过期。 */
    tableExportedAt?: EpochMs
    /** 批次公钥（上传服务端）。 */
    publicKeyJwk: Jwk
    /** 批次私钥（仅管理端本地，随授权文件分发）。 */
    privateKeyJwk?: Jwk
    /** 本批次使用的申请密钥 keyId（离线：单位申请密钥，跨批次复用；用于导入时精确选私钥）。 */
    keyId?: string
    createdAt: EpochMs
    updatedAt: EpochMs
}
