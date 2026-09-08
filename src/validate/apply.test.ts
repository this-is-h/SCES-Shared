import { describe, expect, it } from 'vitest'
import { validateApplyPayload } from './apply'

describe('validateApplyPayload', () => {
    it('合法申请通过', () => {
        const result = validateApplyPayload({
            applyId: 'apply-001',
            batchId: 'batch-001',
            revision: 1,
            personal: { name: '张三', studentId: '20230001' },
        })
        expect(result.ok).toBe(true)
        expect(result.errors).toEqual([])
    })

    it('空内容 → 失败', () => {
        const result = validateApplyPayload(null as unknown as Record<string, unknown>)
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('申请内容为空')
    })

    it('applyId 不能为空', () => {
        const result = validateApplyPayload({
            applyId: '',
            batchId: 'batch-001',
            revision: 1,
            personal: { name: '张三', studentId: '20230001' },
        })
        expect(result.errors).toContain('applyId 不能为空')
    })

    it('batchId 不能为空', () => {
        const result = validateApplyPayload({
            applyId: 'apply-001',
            batchId: undefined,
            revision: 1,
            personal: { name: '张三', studentId: '20230001' },
        })
        expect(result.errors).toContain('batchId 不能为空')
    })

    it('revision 必须为正整数', () => {
        const base = {
            applyId: 'apply-001',
            batchId: 'batch-001',
            personal: { name: '张三', studentId: '20230001' },
        }
        expect(validateApplyPayload({ ...base, revision: 0 }).errors).toContain(
            'revision 必须为正整数',
        )
        expect(validateApplyPayload({ ...base, revision: 1.5 }).errors).toContain(
            'revision 必须为正整数',
        )
        expect(validateApplyPayload({ ...base, revision: 1 }).ok).toBe(true)
    })

    it('个人信息缺少必填字段', () => {
        const result = validateApplyPayload({
            applyId: 'apply-001',
            batchId: 'batch-001',
            revision: 1,
            personal: { name: '张三' },
        })
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('个人信息缺少必填字段：studentId')
    })

    it('自定义必填字段', () => {
        const result = validateApplyPayload(
            {
                applyId: 'apply-001',
                batchId: 'batch-001',
                revision: 1,
                personal: { name: '张三', studentId: '20230001' },
            },
            { requiredPersonalFields: ['name', 'studentId', 'phone'] },
        )
        expect(result.errors).toContain('个人信息缺少必填字段：phone')
    })

    it('个人信息为空', () => {
        const result = validateApplyPayload({
            applyId: 'apply-001',
            batchId: 'batch-001',
            revision: 1,
        })
        expect(result.errors).toContain('个人信息不能为空')
    })

    it('拒绝格式无效的证明材料 base64', () => {
        const result = validateApplyPayload({
            applyId: 'apply-001',
            batchId: 'batch-001',
            revision: 1,
            personal: { name: '张三', studentId: '20230001' },
            dyf: { '1001': { score: 1, evidence: ['not-base64!'] } },
        })
        expect(result.errors).toContain('德育分项目 1001 的证明材料格式无效')
    })

})
