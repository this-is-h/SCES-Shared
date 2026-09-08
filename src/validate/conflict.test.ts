import { describe, expect, it } from 'vitest'
import { checkImport } from './conflict'
import type { ExistingStudent } from './conflict'

const baseExisting: ExistingStudent = {
    studentId: '20230001',
    name: '张三',
    idConflictLocked: false,
    nameCorrected: false,
}

describe('checkImport（学号冲突与可疑导入）', () => {
    it('首次导入（无已有记录）→ accept', () => {
        const result = checkImport({ studentId: '20230001', name: '张三' })
        expect(result.decision).toBe('accept')
    })

    it('学号+姓名一致且未进入审核 → reject（重复导入）', () => {
        const result = checkImport({
            studentId: '20230001',
            name: '张三',
            existing: { ...baseExisting, applyStatus: 'draft' },
        })
        expect(result.decision).toBe('reject')
        expect(result.reason).toContain('重复导入')
    })

    it('学号+姓名一致且已 imported → reject（防重放）', () => {
        const result = checkImport({
            studentId: '20230001',
            name: '张三',
            existing: { ...baseExisting, applyStatus: 'imported' },
        })
        expect(result.decision).toBe('reject')
        expect(result.reason).toContain('已进入审核')
    })

    it('学号同、姓名不同且未锁定 → conflict', () => {
        const result = checkImport({
            studentId: '20230001',
            name: '李四',
            existing: baseExisting,
        })
        expect(result.decision).toBe('conflict')
    })

    it('学号已锁定且姓名不符 → reject', () => {
        const result = checkImport({
            studentId: '20230001',
            name: '李四',
            existing: { ...baseExisting, idConflictLocked: true },
        })
        expect(result.decision).toBe('reject')
        expect(result.reason).toContain('锁定')
    })

    it('姓名已修正且与修正后不符 → reject', () => {
        const result = checkImport({
            studentId: '20230001',
            name: '李四',
            existing: { ...baseExisting, nameCorrected: true },
        })
        expect(result.decision).toBe('reject')
        expect(result.reason).toContain('修正')
    })

    it('锁定后同学号不同姓名直接拒绝（§7.2 场景）', () => {
        const result = checkImport({
            studentId: '20230001',
            name: '王五',
            existing: { ...baseExisting, idConflictLocked: true, name: '张三' },
        })
        expect(result.decision).toBe('reject')
    })
})