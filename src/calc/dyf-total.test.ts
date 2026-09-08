import { describe, expect, it } from 'vitest'
import { calcDyfTotal, resolveDyfTotalConfig, extractDyfTotalConfig } from './dyf-total'
import type { UnitConfig } from '../types'

describe('calcDyfTotal', () => {
    it('空明细 → 0', () => {
        expect(calcDyfTotal([])).toBe(0)
    })

    it('普通分类求和', () => {
        const details = [
            { categoryCode: 'base', itemNumber: '1001', score: 5 },
            { categoryCode: 'base', itemNumber: '1002', score: 3 },
        ]
        expect(calcDyfTotal(details)).toBe(8)
    })

    it('惩罚分类目小计取负（penalty 分类 code 由 config 提供）', () => {
        const details = [
            { categoryCode: 'base', itemNumber: '1001', score: 10 },
            { categoryCode: 'penalty', itemNumber: '9001', score: 2 },
        ]
        expect(calcDyfTotal(details, { penaltyCategoryCodes: ['penalty'] })).toBe(8)
    })

    it('负分项目单项取负（negative 条目 code 由 config 提供）', () => {
        const details = [
            { categoryCode: 'base', itemNumber: '1001', score: 10 },
            { categoryCode: 'base', itemNumber: '8882', score: 3 },
        ]
        expect(calcDyfTotal(details, { negativeItemNumbers: ['8882'] })).toBe(7)
    })

    it('未提供 config 时不识别 penalty/negative（全部正向累加）', () => {
        const details = [
            { categoryCode: 'base', itemNumber: '1001', score: 10 },
            { categoryCode: 'penalty', itemNumber: '8882', score: 2 },
        ]
        expect(calcDyfTotal(details)).toBe(12)
    })

    it('自定义惩罚分类', () => {
        const details = [
            { categoryCode: 'deduct', itemNumber: 'A1', score: 4 },
            { categoryCode: 'add', itemNumber: 'B1', score: 6 },
        ]
        expect(
            calcDyfTotal(details, {
                penaltyCategoryCodes: ['deduct'],
                negativeItemNumbers: [],
            }),
        ).toBe(2)
    })

    it('非法分数被忽略', () => {
        const details = [
            { categoryCode: 'base', itemNumber: '1001', score: 5 },
            { categoryCode: 'base', itemNumber: '1002', score: Number.NaN },
            { categoryCode: 'base', itemNumber: '1003', score: 'abc' as unknown as number },
        ]
        expect(calcDyfTotal(details)).toBe(5)
    })

    it('结果保留两位小数', () => {
        const details = [
            { categoryCode: 'base', itemNumber: '1001', score: 0.1 },
            { categoryCode: 'base', itemNumber: '1002', score: 0.2 },
        ]
        expect(calcDyfTotal(details)).toBe(0.3)
    })

    it('takeHighest 同族只计最高分，平分保留并列项', () => {
        const details = [
            { categoryCode: 'reward', itemNumber: '1311', score: 8 },
            { categoryCode: 'reward', itemNumber: '1312', score: 12 },
            { categoryCode: 'reward', itemNumber: '1313', score: 12 },
        ]
        expect(calcDyfTotal(details, { takeHighestItemKeys: { '1311': 'grp:reward/reward-7', '1312': 'grp:reward/reward-7', '1313': 'grp:reward/reward-7' } })).toBe(12)
    })

    it('resolveDyfTotalConfig 未配置时回退为空（标记驱动，无硬编码默认）', () => {
        const cfg = resolveDyfTotalConfig()
        expect(cfg.penaltyCategoryCodes).toEqual([])
        expect(cfg.negativeItemNumbers).toEqual([])
    })

    it('resolveDyfTotalConfig 配置时去重并过滤空值', () => {
        const cfg = resolveDyfTotalConfig({
            penaltyCategoryCodes: ['deduct', 'deduct', ''],
            negativeItemNumbers: ['A1', 'A1'],
        })
        expect(cfg.penaltyCategoryCodes).toEqual(['deduct'])
        expect(cfg.negativeItemNumbers).toEqual(['A1'])
    })
})

describe('extractDyfTotalConfig（从 UnitConfig 提取标记，决策 #36）', () => {
    const config = {
        schemaVersion: 1,
        id: 'u1',
        name: '单位',
        version: 1,
        revision: 0,
        status: 'published',
        unit: { unitId: 'u', name: '单位', unitType: 'college', parentUnit: { unitId: 's', name: '校' } },
        class: { titles: ['班'], options: [{ text: 'A', value: 'A' }] },
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
                            name: '组',
                            items: [
                                {
                                    code: '1001',
                                    description: '普通项',
                                    scoreType: { type: 'input' },
                                    support: { need: false },
                                    studentApplicable: false,
                                    studentRequired: false,
                                    adminEditable: true,
                                    adminRequired: false,
                                    allowAdd: false,
                                    negative: false,
                                },
                                {
                                    code: '8882',
                                    description: '负分项',
                                    scoreType: { type: 'input' },
                                    support: { need: false },
                                    studentApplicable: false,
                                    studentRequired: false,
                                    adminEditable: true,
                                    adminRequired: false,
                                    allowAdd: false,
                                    negative: true,
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
                            name: '违纪',
                            items: [
                                {
                                    code: '9001',
                                    description: '处分',
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
            ],
        },
        calc: { calcMode: 'weighted', dyfWeight: 0.3, courseWeight: 0.7 },
        rank: { tieRule: 'same-rank' },
    } satisfies UnitConfig

    it('提取 penalty 分类 code 与 negative 条目 code', () => {
        const cfg = extractDyfTotalConfig(config)
        expect(cfg.penaltyCategoryCodes).toEqual(['penalty'])
        expect(cfg.negativeItemNumbers).toEqual(['8882'])
    })

    it('null/undefined → 空配置', () => {
        expect(extractDyfTotalConfig(null)).toEqual({ penaltyCategoryCodes: [], negativeItemNumbers: [] })
        expect(extractDyfTotalConfig(undefined)).toEqual({ penaltyCategoryCodes: [], negativeItemNumbers: [] })
    })

    it('提取结果喂给 calcDyfTotal 得到标记驱动的总分', () => {
        const cfg = extractDyfTotalConfig(config)
        // base:10（含 8882 负分项 -3）= 7；penalty 小计 5 取负 = -5；合计 7 - 5 = 2
        const details = [
            { categoryCode: 'base', itemNumber: '1001', score: 10 },
            { categoryCode: 'base', itemNumber: '8882', score: 3 },
            { categoryCode: 'penalty', itemNumber: '9001', score: 5 },
        ]
        expect(calcDyfTotal(details, cfg)).toBe(2)
    })
})
