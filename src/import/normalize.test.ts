import { describe, expect, it } from 'vitest'
import type { UnitConfig } from '../types'
import type { ImportPayload } from '../types/import'
import { normalizeImportDyf, findTemplateItem, scorePrecisionOf } from './normalize'

/** 最小单位配置（对齐 nxu/lx 结构：类别 → 组 → 项目）。 */
const template: UnitConfig = {
    schemaVersion: 1,
    id: 'template-nxu-lx-1',
    name: '测试模板',
    version: 1,
    revision: 0,
    status: 'published',
    unit: {
        unitId: 'testUnit',
        name: '测试单位',
        unitType: 'college',
        parentUnit: { unitId: 'testSchool', name: '测试学校' },
    },
    class: {
        titles: ['学院', '专业', '班级'],
        options: [{ text: '学院A', value: '学院A' }],
    },
    student: [{ code: 'name', label: '姓名', required: true, type: 'text' }],
    dyf: {
        categories: [
            {
                code: 'base',
                name: '基础分',
                studentRequired: false,
                adminRequired: false,
                penalty: false,
                groups: [
                    {
                        code: 'g1',
                        name: '基础组',
                        items: [
                            {
                                code: '1001',
                                description: '固定分项',
                                scoreType: { type: 'stepper', min: 0, max: 2, step: 1 },
                                support: { need: false },
                                studentApplicable: false,
                                studentRequired: false,
                                adminEditable: true,
                                adminRequired: false,
                                allowAdd: false,
                                negative: false,
                            },
                            {
                                code: '1002',
                                description: '区间分项',
                                scoreType: { type: 'stepper', min: 0, max: 10, step: 1 },
                                support: { need: false },
                                studentApplicable: true,
                                studentRequired: false,
                                adminEditable: true,
                                adminRequired: false,
                                allowAdd: true,
                                negative: false,
                            },
                            {
                                code: '1003',
                                description: '自填分项',
                                scoreType: { type: 'input' },
                                support: { need: false },
                                studentApplicable: false,
                                studentRequired: false,
                                adminEditable: true,
                                adminRequired: false,
                                allowAdd: false,
                                negative: false,
                            },
                        ],
                    },
                ],
            },
            {
                code: 'penalty',
                name: '惩罚分',
                studentRequired: false,
                adminRequired: false,
                penalty: true,
                groups: [
                    {
                        code: 'g2',
                        name: '惩罚组',
                        items: [
                            {
                                code: '8882',
                                description: '惩罚项',
                                scoreType: { type: 'stepper', min: 0, max: 1, step: 1 },
                                support: { need: false },
                                studentApplicable: false,
                                studentRequired: false,
                                adminEditable: true,
                                adminRequired: false,
                                allowAdd: false,
                                negative: false,
                            },
                        ],
                    },
                ],
            },
        ],
    },
    calc: { calcMode: 'weighted', dyfWeight: 0.3, courseWeight: 0.7 },
    rank: { tieRule: 'same-rank' },
}

function makePayload(dyf: ImportPayload['dyf']): ImportPayload {
    return {
        applyId: 'apply-1',
        revision: 1,
        batchId: 'batch-1',
        personal: { name: '张三', studentId: '20230001' },
        dyf,
    }
}

describe('normalizeImportDyf（.dyf payload → 可入库明细）', () => {
    it('模板内项目：解析 category / allowAdd / maxScore', () => {
        const result = normalizeImportDyf(
            makePayload({
                '1001': { score: 2 },
                '1002': { score: 8, evidence: ['aGVsbG8='] },
            }),
            template,
        )
        expect(result.unknownItems).toEqual([])
        expect(result.scores).toEqual([
            { itemCode: '1001', category: 'base', appliedScore: 2, evidence: [], allowAdd: false, maxScore: 2 },
            { itemCode: '1002', category: 'base', appliedScore: 8, evidence: ['aGVsbG8='], allowAdd: true, maxScore: 10 },
        ])
    })

    it('模板未定义的项目：保留导入、类别为「未知」，并记入 unknownItems', () => {
        const result = normalizeImportDyf(makePayload({ '9999': { score: 3 } }), template)
        expect(result.unknownItems).toEqual(['9999'])
        expect(result.scores[0]).toMatchObject({ itemCode: '9999', category: '未知', appliedScore: 3, allowAdd: false })
    })

    it('忽略非法条目（非对象 / 分数非法）', () => {
        const result = normalizeImportDyf(
            makePayload({ '1001': { score: 'abc' }, bad: 'not-object', '1003': { score: 0 } } as unknown as ImportPayload['dyf']),
            template,
        )
        expect(result.scores).toEqual([
            { itemCode: '1003', category: 'base', appliedScore: 0, evidence: [], allowAdd: false },
        ])
    })

    it('惩罚分类目正常映射', () => {
        const result = normalizeImportDyf(makePayload({ '8882': { score: 1 } }), template)
        expect(result.scores[0]).toMatchObject({ itemCode: '8882', category: 'penalty' })
    })
})

describe('findTemplateItem', () => {
    it('命中返回分类 code/allowAdd/上限', () => {
        expect(findTemplateItem(template, '1002')).toEqual({ category: 'base', allowAdd: true, maxScore: 10, studentApplicable: true })
        expect(findTemplateItem(template, '1001')).toEqual({ category: 'base', allowAdd: false, maxScore: 2, studentApplicable: false })
    })

    it('未命中返回 null', () => {
        expect(findTemplateItem(template, 'nope')).toBeNull()
    })
})

describe('scorePrecisionOf（输入精度：三端一致的步长/小数位）', () => {
    it('stepper：step 与 decimals 用配置值', () => {
        expect(scorePrecisionOf({ type: 'stepper', min: 0, max: 5, step: 0.5, decimals: 1 })).toEqual({
            step: 0.5,
            decimals: 1,
        })
    })

    it('stepper：缺省 decimals → 0', () => {
        expect(scorePrecisionOf({ type: 'stepper', min: 0, max: 2, step: 1 })).toEqual({ step: 1, decimals: 0 })
    })

    it('input：无 step，由 decimals 推导步长（1→0.1，2→0.01）', () => {
        expect(scorePrecisionOf({ type: 'input', min: 0, max: 100, decimals: 1 })).toEqual({ step: 0.1, decimals: 1 })
        expect(scorePrecisionOf({ type: 'input', min: 0, max: 100, decimals: 2 })).toEqual({ step: 0.01, decimals: 2 })
    })

    it('input：无 decimals → 整数（step 1，decimals 0）', () => {
        expect(scorePrecisionOf({ type: 'input', min: 0, max: 100 })).toEqual({ step: 1, decimals: 0 })
    })

    it('radio：候选皆整数 → step 1 / decimals 0', () => {
        expect(
            scorePrecisionOf({ type: 'radio', options: [{ value: 0, label: '无' }, { value: 2, label: '有' }] }),
        ).toEqual({ step: 1, decimals: 0 })
    })

    it('radio：候选含小数 → 由最大小数位推导，保证可精确表示', () => {
        expect(
            scorePrecisionOf({ type: 'radio', options: [{ value: 0, label: '无' }, { value: 1.5, label: '半' }] }),
        ).toEqual({ step: 0.1, decimals: 1 })
    })

    it('decimals 超出 schema 上限时夹到 2', () => {
        expect(scorePrecisionOf({ type: 'input', min: 0, max: 10, decimals: 5 })).toEqual({ step: 0.01, decimals: 2 })
    })

    it('scoreType 缺失 → 整数默认', () => {
        expect(scorePrecisionOf(undefined)).toEqual({ step: 1, decimals: 0 })
    })
})
