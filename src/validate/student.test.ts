import { describe, expect, it } from 'vitest'
import { validateStudent, validateStudentId, validateStudentName, validateStudentFields } from './student'
import type { StudentField } from '../types'

describe('validateStudent', () => {
    it('合法学生通过', () => {
        const result = validateStudent({ studentId: '20230001', name: '张三' })
        expect(result.ok).toBe(true)
        expect(result.errors).toEqual([])
    })

    it('学号格式不正确', () => {
        const result = validateStudent({ studentId: 'abc', name: '张三' })
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('学号格式不正确')
    })

    it('姓名不能为空', () => {
        const result = validateStudent({ studentId: '20230001', name: '  ' })
        expect(result.ok).toBe(false)
        expect(result.errors).toContain('姓名不能为空')
    })

    it('自定义学号正则', () => {
        const result = validateStudent(
            { studentId: '2023-0001', name: '张三' },
            { studentIdPattern: /^\d{4}-\d{4}$/ },
        )
        expect(result.ok).toBe(true)
    })

    it('requireName=false 时姓名可空', () => {
        const result = validateStudent({ studentId: '20230001' }, { requireName: false })
        expect(result.ok).toBe(true)
    })

    it('validateStudentId 独立校验', () => {
        expect(validateStudentId('20230001')).toBe(true)
        expect(validateStudentId('')).toBe(false)
        expect(validateStudentId(123 as unknown as string)).toBe(false)
    })

    it('validateStudentName 独立校验', () => {
        expect(validateStudentName('张三')).toBe(true)
        expect(validateStudentName('')).toBe(false)
        expect(validateStudentName(null as unknown as string)).toBe(false)
    })
})

describe('validateStudentFields', () => {
    const fields: StudentField[] = [
        { code: 'name', label: '姓名', required: true, type: 'text' },
        { code: 'studentId', label: '学号', required: true, type: 'text', pattern: '^1\\d{10}$', message: '学号应为11位数字' },
        { code: 'phone', label: '手机号', required: false, type: 'text', pattern: '^1[3-9]\\d{9}$' },
        { code: 'bad', label: '异常字段', required: false, type: 'text', pattern: '(' },
        {
            code: 'className',
            label: '班级',
            required: false,
            type: 'text',
            fromClass: true,
            pattern: '^[\\u4e00-\\u9fa5a-zA-Z0-9]+班$',
            message: '班级名称应为“xx班”',
        },
    ]

    it('必填为空报错(缺省文案)', () => {
        const r = validateStudentFields(fields, { studentId: '10000000000' })
        expect(r.ok).toBe(false)
        expect(r.errors).toContain('姓名不能为空')
    })

    it('正则不匹配报错(用配置 message)', () => {
        const r = validateStudentFields(fields, { name: '张三', studentId: 'abc' })
        expect(r.ok).toBe(false)
        expect(r.errors).toContain('学号应为11位数字')
    })

    it('全部合法通过', () => {
        const r = validateStudentFields(fields, { name: '张三', studentId: '10000000000', phone: '13800000000' })
        expect(r.ok).toBe(true)
        expect(r.errors).toEqual([])
    })

    it('非必填留空跳过正则', () => {
        const r = validateStudentFields(fields, { name: '张三', studentId: '10000000000' })
        expect(r.ok).toBe(true)
    })

    it('非法正则不阻断填写', () => {
        const r = validateStudentFields(fields, { name: '张三', studentId: '10000000000', bad: '任意值' })
        expect(r.ok).toBe(true)
    })

    it('fromClass 字段跳过正则校验(含合法标点的班级名不误报)', () => {
        // className 由班级级联自动填充(如"生物科学（师范）1班"),全角括号不在正则字符类内,
        // 若不跳过会被误判为格式错误。fromClass 字段本身已由级联保证是配置里的合法班级。
        const r = validateStudentFields(fields, {
            name: '张三',
            studentId: '10000000000',
            className: '生物科学（师范）1班',
        })
        expect(r.ok).toBe(true)
        expect(r.errors).toEqual([])
    })
})