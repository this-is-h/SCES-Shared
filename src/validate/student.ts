import type { ValidationResult, StudentField } from '../types'
import { nz, opt } from '../nullish'

/** 学生信息输入（字段值可为 unknown，便于校验外部数据）。 */
export interface StudentInput {
    studentId?: unknown
    name?: unknown
    phone?: unknown
    grade?: unknown
    major?: unknown
    className?: unknown
}

/** 学生校验选项。 */
export interface StudentValidationOptions {
    /** 学号正则（默认：4-20 位字母数字，多校可覆盖）。 */
    studentIdPattern?: RegExp
    /** 学号是否必填（默认 true）。 */
    requireStudentId?: boolean
    /** 姓名是否必填（默认 true）。 */
    requireName?: boolean
}

const DEFAULT_STUDENT_ID_PATTERN = /^[A-Za-z0-9]{4,20}$/

/** 校验学号格式。 */
export function validateStudentId(studentId: unknown, pattern?: RegExp): boolean {
    if (typeof studentId !== 'string') return false
    const re = nz(pattern, DEFAULT_STUDENT_ID_PATTERN)
    return re.test(studentId.trim())
}

/** 校验姓名非空。 */
export function validateStudentName(name: unknown): boolean {
    return typeof name === 'string' && name.trim().length > 0
}

/** 校验学生必填信息。 */
export function validateStudent(
    input: StudentInput,
    options?: StudentValidationOptions,
): ValidationResult {
    const errors: string[] = []
    const requireStudentId = nz(opt(options, 'requireStudentId'), true)
    const requireName = nz(opt(options, 'requireName'), true)

    if (requireStudentId && !validateStudentId(opt(input, 'studentId'), opt(options, 'studentIdPattern'))) {
        errors.push('学号格式不正确')
    }
    if (requireName && !validateStudentName(opt(input, 'name'))) {
        errors.push('姓名不能为空')
    }
    return { ok: errors.length === 0, errors }
}

/**
 * 面向 UnitConfig.student(StudentField[])的表单校验(离线/在线一致)。
 * - 正则来自配置(外部输入):`new RegExp(pattern)` 包在 try/catch,非法正则跳过该字段正则校验(不阻断填写);
 * - 不传 flags,天然排除有状态的 g/y(lastIndex 会使校验结果随调用次数漂移);
 * - `fromClass` 字段(由班级级联自动填充,如 major/className)跳过正则校验:级联值是配置里的合法班级,
 *   本身已保证正确,再套格式正则会对含合法标点(如全角括号"（师范）")的班级名误报。
 * @param fields 配置字段(顺序即渲染顺序)
 * @param values 学生已填值(键 = field.code)
 */
export function validateStudentFields(
    fields: StudentField[],
    values: Record<string, unknown>,
): ValidationResult {
    const errors: string[] = []
    for (const field of fields) {
        const raw = values[field.code]
        const text = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw)
        if (text === '') {
            if (field.required) {
                errors.push(nz(field.message, `${field.label}不能为空`))
            }
            continue
        }
        if (!field.fromClass && typeof field.pattern === 'string' && field.pattern.length > 0) {
            let re: RegExp | null = null
            try {
                re = new RegExp(field.pattern)
            } catch (e) {
                re = null
            }
            if (re && !re.test(text)) {
                errors.push(nz(field.message, `${field.label}格式不正确`))
            }
        }
    }
    return { ok: errors.length === 0, errors }
}