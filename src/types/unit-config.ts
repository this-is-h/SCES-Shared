import type { EpochMs } from './common'

/**
 * 单位配置（UnitConfig）：一个二级单位一份。
 *
 * 结构与 `SCES-Server/contracts/unit-config.schema.json`（JSON Schema 2020-12，配置结构**唯一权威**）
 * 逐字段对齐——本文件是该 schema 的手写 TypeScript 映射（决策 #38：契约唯一权威）。
 * shared 是纯 TS 包且被小程序机械 vendoring，不引入 codegen；防止与 schema 漂移由
 * `unit-config.test.ts`（编译期 satisfies + 运行期读契约种子抽样）把关。
 *
 * 单位信息 + 班级级联 + 学生字段 + 德育分项目（标记内嵌） + 计算规则 + 排名规则。
 */

/** 发布状态：draft 可编辑 / published 不可编辑且可被批次引用 / archived 仅归档不可再引用。 */
export type UnitConfigStatus = 'draft' | 'published' | 'archived'

/** 二级单位类型：college 书院/学院 / department 系部 / other 其他。 */
export type UnitType = 'college' | 'department' | 'other'

/**
 * 配置绑定的二级单位（决策 #34：二级单位为唯一批次主体，一级单位仅作展示分组）。
 */
export interface UnitBinding {
    /** 单位 id（camelCase，与学生端单位树 value 一致，如 nxuLx / testTest1）。 */
    unitId: string
    /** 单位名称。 */
    name: string
    unitType: UnitType
    /** 一级单位（学校）。 */
    parentUnit: {
        unitId: string
        name: string
    }
}

/** 班级级联节点（学院 → 专业 → 班级）。 */
export interface CascaderNode {
    /** 显示文本（当层内唯一）。 */
    text: string
    /** 取值（叶子节点的 value 即班级全名，需全局唯一）。 */
    value: string
    children?: CascaderNode[]
}

/** 班级级联选择器：层级数由 titles 长度决定。 */
export interface ClassCascader {
    /** 各层标题（如 ["学院","专业","班级"]），长度 1~4。 */
    titles: string[]
    options: CascaderNode[]
}

/** 学生基本信息字段（学生端表单项），顺序即渲染顺序。 */
export interface StudentField {
    /** 字段 code（camelCase，与 shared Student 类型字段对应）。 */
    code: string
    label: string
    required: boolean
    /** 输入类型：text 文本 / number 数字。 */
    type: 'text' | 'number'
    /** 校验正则（ECMAScript 语法，字符串形式）。 */
    pattern?: string
    /** 校验失败提示文案。 */
    message?: string
    /** true 表示该字段由班级级联选择自动填充，学生端不可直接编辑。 */
    fromClass?: boolean
}

/**
 * 步进器计分：max 缺省表示无上限。
 */
export interface ScoreTypeStepper {
    type: 'stepper'
    min: number
    max?: number
    /** 步长，> 0。 */
    step: number
    /** 小数位数（0~2）。 */
    decimals?: number
}

/** 单选计分：固定候选分值（至少 2 项）。 */
export interface ScoreTypeRadio {
    type: 'radio'
    options: Array<{
        value: number
        label: string
    }>
}

/** 手动输入计分：min / max 均可缺省。 */
export interface ScoreTypeInput {
    type: 'input'
    min?: number
    max?: number
    /** 小数位数（0~2）。 */
    decimals?: number
}

/**
 * 计分方式（决策 #35，判别字段 `type`）：
 * - stepper 步进器 / radio 单选 / input 手动输入。
 * 分值上限由本对象承载（stepper/input 的 `max`、radio 的 `options` 最大 value），
 * **不再是旧 DyfItem.support**（旧 support = 分值，新 support = 证明材料要求，语义已翻转）。
 */
export type ScoreType = ScoreTypeStepper | ScoreTypeRadio | ScoreTypeInput

/**
 * 证明材料要求（判别字段 `need`）：need 为 true 时必须给出 message 提示文案。
 * 注意：这是旧 `DyfItem.support`（分值）语义翻转后的新含义。
 */
export type Support = { need: false } | { need: true; message: string }

/** 德育分项目（条目）。 */
export interface DyfItem {
    /** 条目编号（数字串，单位内唯一；沿用德育分办法编号，如 111 / 8882）。 */
    code: string
    description: string
    scoreType: ScoreType
    /** 证明材料要求（need/message）。 */
    support: Support
    /** 学生端可申请（可见并可填）。 */
    studentApplicable: boolean
    /** 学生端必填条目（原 config.studentRequiredExtraItemNumbers）。 */
    studentRequired: boolean
    /** 管理端可修改该条目分数。 */
    adminEditable: boolean
    /** 管理端必填条目（原 config.adminRequiredExtraItemNumbers）。 */
    adminRequired: boolean
    /** 允许学生端多次累加（同一条目多条业绩累积）。 */
    allowAdd: boolean
    /** 该条目单项取负计入总分（原 config.totalScoreNegativeItemNumbers，决策 #36）。 */
    negative: boolean
}

/** 取最高分的聚合范围：分类、分组或条目编号前缀。 */
export type TakeHighestScope = 'category' | 'group' | 'prefix'

/** 德育分项目组。 */
export interface DyfGroup {
    /** 组 code（kebab-case）。 */
    code: string
    name: string
    /** 同一族内只计最高分；未设置时组内项目正常累加。 */
    takeHighest?: false | { scope: TakeHighestScope; prefixLength?: number }
    items: DyfItem[]
}

/** 德育分类别。 */
export interface DyfCategory {
    /** 类别 code（kebab-case）。 */
    code: string
    name: string
    /** 该分类下条目学生端必填（原 config.studentRequiredCategories）。 */
    studentRequired: boolean
    /** 该分类下条目管理端必填（原 config.adminRequiredCategories）。 */
    adminRequired: boolean
    /** 该分类计为惩罚分，总分按负向累加（原 config.totalScorePenaltyCategoryCodes，决策 #36）。 */
    penalty: boolean
    /** 同一族内只计最高分；未设置时分类内项目正常累加。 */
    takeHighest?: false | { scope: TakeHighestScope; prefixLength?: number }
    groups: DyfGroup[]
}

/** 德育分项目树：分类 → 组 → 条目。 */
export interface DyfConfig {
    categories: DyfCategory[]
}

/**
 * 综测成绩计算规则（shared calc 引擎消费，判别字段 `calcMode`）：
 * formula 模式必须给出表达式。
 */
export type UnitCalcConfig =
    | {
          calcMode: 'weighted'
          /** 德育分权重（0~1）。 */
          dyfWeight: number
          /** 课程成绩权重（0~1）。 */
          courseWeight: number
      }
    | {
          calcMode: 'formula'
          dyfWeight: number
          courseWeight: number
          /** 自定义计算表达式。 */
          formula: string
      }

/**
 * 排名规则（决策 #21：scopes 已取消，仅保留并列规则）。
 * - same-rank：同分同名次，下一名次跳号（1,2,2,4）。
 * - dense：同分同名次，名次不跳号（1,2,2,3）。
 */
export interface UnitRankConfig {
    tieRule: 'same-rank' | 'dense'
}

/**
 * 单位配置：一个二级单位一份（决策 #38：SCES-Server/contracts/seed/ 种子为唯一权威）。
 */
export interface UnitConfig {
    /** 本 schema 的版本号，当前固定为 1。 */
    schemaVersion: 1
    /** 配置模板 id（kebab-case，全局唯一）。 */
    id: string
    /** 配置模板名称（面向人的显示名）。 */
    name: string
    /** 业务版本号，从 1 起递增。 */
    version: number
    /** 修订号，同一 version 内从 0 起递增。 */
    revision: number
    status: UnitConfigStatus
    unit: UnitBinding
    class: ClassCascader
    /** 学生基本信息字段，顺序即渲染顺序（至少 1 项）。 */
    student: StudentField[]
    dyf: DyfConfig
    calc: UnitCalcConfig
    rank: UnitRankConfig
    /** 最后更新时间（epoch ms）。仅服务端下发配置时附带；种子文件不含此字段。 */
    updatedAt?: EpochMs
}
