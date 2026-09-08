import { describe, expect, it } from 'vitest'
import { extractDyfTotalConfig } from './dyf-total'
import { FormulaCalc } from './formula'
import { WeightedCalc } from './weighted'
import type { UnitConfig } from '../types'

describe('FormulaCalc（公式模式占位契约）', () => {
    const calc = new FormulaCalc()

    it('calcDyfTotal 抛「尚未实现」', () => {
        expect(() => calc.calcDyfTotal([])).toThrow(/尚未实现/)
    })
    it('calcFinalTotal 抛「尚未实现」', () => {
        expect(() => calc.calcFinalTotal(10, 20, {} as never)).toThrow(/尚未实现/)
    })
    it('calcRank 抛「尚未实现」', () => {
        expect(() => calc.calcRank([])).toThrow(/尚未实现/)
    })
})

describe('WeightedCalc 字段回退与权重默认值', () => {
    const calc = new WeightedCalc()

    it('非数组明细 → 0（不崩溃）', () => {
        expect(calc.calcDyfTotal(undefined as never)).toBe(0)
    })

    it('finalScore 缺省时回退 appliedScore', () => {
        expect(
            calc.calcDyfTotal([{ category: 'base', itemCode: '1001', appliedScore: 3 } as never]),
        ).toBe(3)
    })

    it('finalScore 优先于 appliedScore', () => {
        expect(
            calc.calcDyfTotal([
                { category: 'base', itemCode: '1001', finalScore: 5, appliedScore: 3 } as never,
            ]),
        ).toBe(5)
    })

    it('空 category 行被忽略（不参与总分）', () => {
        expect(
            calc.calcDyfTotal([{ category: '', itemCode: '1001', finalScore: 5 } as never]),
        ).toBe(0)
    })

    it('缺少权重配置 → 总分 0', () => {
        expect(calc.calcFinalTotal(10, 20, {} as never)).toBe(0)
    })

    it('按权重计算综测总分（保留两位小数）', () => {
        expect(calc.calcFinalTotal(10, 20, { dyfWeight: 0.4, courseWeight: 0.6 } as never)).toBe(16)
    })
})

describe('extractDyfTotalConfig 标记提取', () => {
    const config = (dyf: unknown): UnitConfig =>
        ({ dyf, unit: { unitId: 't', unitName: 't', unitType: 'college' } }) as never

    it('null / undefined → 空标记', () => {
        expect(extractDyfTotalConfig(null)).toEqual({ penaltyCategoryCodes: [], negativeItemNumbers: [] })
        expect(extractDyfTotalConfig(undefined)).toEqual({ penaltyCategoryCodes: [], negativeItemNumbers: [] })
    })

    it('收集 penalty 分类与 negative 条目', () => {
        const cfg = config({
            categories: [
                { code: 'base', name: '基础', groups: [{ items: [{ code: '8882', negative: true, scoreType: 'stepper' }] }] },
                { code: 'pen', name: '惩罚', penalty: true, groups: [] },
            ],
        })
        expect(extractDyfTotalConfig(cfg)).toEqual({
            penaltyCategoryCodes: ['pen'],
            negativeItemNumbers: ['8882'],
        })
    })

    it('takeHighest scope=category → cat: 键', () => {
        const cfg = config({
            categories: [
                { code: 'base', name: '基础', takeHighest: { scope: 'category' }, groups: [{ items: [{ code: '1001' }] }] },
            ],
        })
        expect(extractDyfTotalConfig(cfg).takeHighestItemKeys).toEqual({ '1001': 'cat:base' })
    })

    it('takeHighest scope=group → grp: 键', () => {
        const cfg = config({
            categories: [
                { code: 'base', name: '基础', groups: [{ code: 'g1', takeHighest: { scope: 'group' }, items: [{ code: '1001' }] }] },
            ],
        })
        expect(extractDyfTotalConfig(cfg).takeHighestItemKeys).toEqual({ '1001': 'grp:base/g1' })
    })

    it('takeHighest scope=prefix 按 prefixLength 截断', () => {
        const cfg = config({
            categories: [
                { code: 'base', name: '基础', takeHighest: { scope: 'prefix', prefixLength: 3 }, groups: [{ items: [{ code: '1001' }] }] },
            ],
        })
        expect(extractDyfTotalConfig(cfg).takeHighestItemKeys).toEqual({ '1001': 'pre:base/100' })
    })

    it('takeHighest scope=prefix 未给 prefixLength → 不截断（空前缀）', () => {
        const cfg = config({
            categories: [
                { code: 'base', name: '基础', takeHighest: { scope: 'prefix' }, groups: [{ items: [{ code: '1001' }] }] },
            ],
        })
        expect(extractDyfTotalConfig(cfg).takeHighestItemKeys).toEqual({ '1001': 'pre:base/' })
    })
})