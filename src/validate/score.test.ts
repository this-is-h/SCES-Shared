import { describe, expect, it } from 'vitest'
import { canAdjustScore, adjustDirection, isStudentApplicableItem } from './score'
import type { DyfItem } from '../types'

// 工厂默认不含 studentApplicable，以便验证「缺省时按 config.js 回退」分支
// （运行期 studentApplicable=undefined 触发回退；新 DyfItem 该字段虽必填，此处用断言构造）。
const item = (over: Partial<DyfItem>): DyfItem =>
    ({
        code: '1001',
        description: '测试项',
        scoreType: { type: 'input' },
        support: { need: false },
        studentRequired: false,
        adminEditable: true,
        adminRequired: false,
        allowAdd: false,
        negative: false,
        ...over,
    }) as DyfItem

describe('canAdjustScore（加减分权限，权限矩阵 §6.2）', () => {
    it('扣分：三级/二级/一级均可', () => {
        for (const role of ['level1', 'level2', 'level3'] as const) {
            expect(canAdjustScore({ role, allowAdd: false, direction: 'deduct', studentApplicable: true })).toBe(true)
            expect(canAdjustScore({ role, allowAdd: true, direction: 'deduct', studentApplicable: true })).toBe(true)
        }
    })

    it('加分（学生申请项）：一级对所有项目均可（含不可加分项）', () => {
        expect(canAdjustScore({ role: 'level1', allowAdd: true, direction: 'add', studentApplicable: true })).toBe(true)
        expect(canAdjustScore({ role: 'level1', allowAdd: false, direction: 'add', studentApplicable: true })).toBe(true)
    })

    it('加分（学生申请项）：二级仅可对允许加分的项目', () => {
        expect(canAdjustScore({ role: 'level2', allowAdd: true, direction: 'add', studentApplicable: true })).toBe(true)
        expect(canAdjustScore({ role: 'level2', allowAdd: false, direction: 'add', studentApplicable: true })).toBe(false)
    })

    it('加分（学生申请项）：三级一律不允许', () => {
        expect(canAdjustScore({ role: 'level3', allowAdd: true, direction: 'add', studentApplicable: true })).toBe(false)
        expect(canAdjustScore({ role: 'level3', allowAdd: false, direction: 'add', studentApplicable: true })).toBe(false)
    })

    it('管理端补录（非学生申请项）：任何角色都可录入，不受加分限制', () => {
        for (const role of ['level1', 'level2', 'level3'] as const) {
            expect(canAdjustScore({ role, allowAdd: false, direction: 'add', studentApplicable: false })).toBe(true)
            expect(canAdjustScore({ role, allowAdd: true, direction: 'add', studentApplicable: false })).toBe(true)
        }
    })
})

describe('adjustDirection（分数调整方向）', () => {
    it('finalScore 低于申请分 → deduct', () => {
        expect(adjustDirection(5, 3)).toBe('deduct')
    })

    it('finalScore 高于申请分 → add', () => {
        expect(adjustDirection(3, 5)).toBe('add')
    })

    it('相等 → keep', () => {
        expect(adjustDirection(3, 3)).toBe('keep')
    })
})

describe('isStudentApplicableItem（学生端可申请判定，决策 #13）', () => {
    it('模板标记 studentApplicable 优先', () => {
        expect(isStudentApplicableItem(item({ studentApplicable: false }), '奖励分')).toBe(false)
        expect(isStudentApplicableItem(item({ studentApplicable: true }), '基础分')).toBe(true)
    })

    it('缺省标记时按旧版 config.js 兼容回退：类别命中 奖励分/第八项第三条', () => {
        expect(isStudentApplicableItem(item({ code: '1001' }), '奖励分')).toBe(true)
        expect(isStudentApplicableItem(item({ code: '8882' }), '第八项第三条')).toBe(true)
        expect(isStudentApplicableItem(item({ code: '111' }), '基础分')).toBe(false)
        expect(isStudentApplicableItem(item({ code: '1511' }), '惩罚分')).toBe(false)
    })

    it('缺省标记时编号命中 313/521（基础分类内的学生可填项）', () => {
        expect(isStudentApplicableItem(item({ code: '313' }), '基础分')).toBe(true)
        expect(isStudentApplicableItem(item({ code: '521' }), '基础分')).toBe(true)
        expect(isStudentApplicableItem(item({ code: '311' }), '基础分')).toBe(false)
    })
})
