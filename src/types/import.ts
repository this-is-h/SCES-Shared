/**
 * 导入载荷类型：.dyf 加密前 payload 的规范结构（架构 §3.3 / §5.1，决策 #9）。
 * 学生端（微信小程序）导出时按此结构构造（utils/apply-payload.ts），
 * 管理端导入时按此解析（M3）。三端共享同一份类型，避免字段漂移。
 */

/** 个人信息（.dyf payload 内，字段名与配置模板 personal 对齐）。 */
export interface ImportPersonal {
    /** 姓名。 */
    name: string
    /** 学号。 */
    studentId: string
    phone?: string
    grade?: string
    major?: string
    /** 班级。 */
    className?: string
    /** 学年（学生端表单透传，字符串）。 */
    year?: string
    /** 学期（学生端表单透传，字符串）。 */
    semester?: string
    [key: string]: unknown
}

/** .dyf payload 内的德育分明细项。 */
export interface ImportDyfEntry {
    /** 学生申请分。 */
    score: number
    /** 证明材料 base64 数组。 */
    evidence?: string[]
    /** v2 .dyf 中资产帧的内容寻址引用。导入落盘前由管理端解析为 evidence。 */
    evidenceRefs?: string[]
}

/**
 * 申请导入 payload（.dyf 解密后）：
 *   { applyId, revision, batchId, personal, dyf: { itemCode: { score, evidence[] } }, confirmSlip? }
 */
export interface ImportPayload {
    documentType?: 'student-application'
    /** 申请唯一标识（学生×批次唯一，防重放）。 */
    applyId: string
    /** 申请版本号（每次导出递增）。 */
    revision: number
    batchId: string
    personal: ImportPersonal
    /** 德育分明细（仅包含非零分项）。 */
    dyf: Record<string, ImportDyfEntry>
    /** 确认单截图 base64（可选）。 */
    confirmSlip?: string
    /** v2 .dyf 中确认单资产帧的内容寻址引用。 */
    confirmSlipRef?: string
    /** 导出时间（epoch ms）：管理端据此判定是否申请期外导出（决策 #48 / 06 §4）。 */
    exportedAt?: number
    /** 学生端生命周期摘要与导出历史，v2 文件使用。 */
    lifecycle?: {
        enteredAt?: number
        exports?: Array<{ revision: number; exportedAt: number; fileHash?: string }>
    }
    /** 学生端事件历史；管理端导入后按 eventId 幂等合并。 */
    timeline?: Array<{
        eventId: string
        action: 'student.entered' | 'student.exported'
        occurredAt: number
        revision?: number
        sourceFileHash?: string
    }>
    /** v2 .dyf 资产描述只作为 manifest 校验信息，正文位于二进制帧。 */
    assets?: Array<{ assetId: string; sha256: string; mimeType: string; size: number }>
}
