import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { UnitConfig } from './unit-config'

/**
 * UnitConfig 防漂移测试（决策 #38：配置结构唯一权威在
 * `server/contracts/unit-config.schema.json`；本文件是该 schema 的手写 TS 映射）。
 *
 * shared 不依赖 @dms/contracts 包（纯 TS + 小程序机械 vendoring），故用两层校验
 * 顶住手写类型与契约 schema 漂移：
 * - 编译期：内联样本 `satisfies UnitConfig`（覆盖三种 scoreType + support 两态），
 *   类型缺字段/写错立即 tsc 报错。
 * - 运行期：`node:fs` 读契约种子（monorepo 内相对路径，仅测试期存在，不进 vendoring/构建），
 *   抽样断言关键字段结构。契约种子结构一变，本测试即红。
 */

// ── 编译期护栏：三种 scoreType + support 两态必须都能被类型接纳 ──
const COMPILE_TIME_SAMPLE = {
    schemaVersion: 1,
    id: 'sample-unit',
    name: '样本单位',
    version: 1,
    revision: 0,
    status: 'published',
    unit: {
        unitId: 'sampleUnit',
        name: '样本二级单位',
        unitType: 'college',
        parentUnit: { unitId: 'sampleSchool', name: '样本学校' },
    },
    class: {
        titles: ['学院', '专业', '班级'],
        options: [
            {
                text: '学院A',
                value: '学院A',
                children: [
                    { text: '专业A', value: '专业A', children: [{ text: '1班', value: '专业A1班' }] },
                ],
            },
        ],
    },
    student: [
        { code: 'name', label: '姓名', required: true, type: 'text' },
        { code: 'studentId', label: '学号', required: true, type: 'text', pattern: '^\\d+$', message: '学号格式错误' },
    ],
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
                        code: 'base-1',
                        name: '组一',
                        items: [
                            {
                                code: '111',
                                description: 'stepper 型 + 无需材料',
                                scoreType: { type: 'stepper', min: 0, max: 2, step: 1, decimals: 0 },
                                support: { need: false },
                                studentApplicable: false,
                                studentRequired: false,
                                adminEditable: true,
                                adminRequired: false,
                                allowAdd: false,
                                negative: false,
                            },
                            {
                                code: '313',
                                description: 'radio 型 + 需要材料',
                                scoreType: {
                                    type: 'radio',
                                    options: [
                                        { value: 0, label: '未通过' },
                                        { value: 4, label: '通过' },
                                    ],
                                },
                                support: { need: true, message: '证书扫描件' },
                                studentApplicable: true,
                                studentRequired: false,
                                adminEditable: true,
                                adminRequired: false,
                                allowAdd: false,
                                negative: false,
                            },
                            {
                                code: '8882',
                                description: 'input 型 + 负分项',
                                scoreType: { type: 'input', min: 0, max: 100, decimals: 1 },
                                support: { need: false },
                                studentApplicable: false,
                                studentRequired: false,
                                adminEditable: true,
                                adminRequired: false,
                                allowAdd: true,
                                negative: true,
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

// ── 运行期护栏：读契约种子（唯一权威），抽样断言结构 ──
const SEED_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../SCES-Server/contracts/seed/lixing-shuyuan.json',
)

function loadSeed(): Record<string, unknown> {
    return JSON.parse(readFileSync(SEED_PATH, 'utf-8')) as Record<string, unknown>
}

describe('UnitConfig 编译期样本', () => {
    it('三种 scoreType 与 support 两态都被类型接纳', () => {
        // 能走到这里即 satisfies 通过；再做一次运行期存在性确认。
        expect(COMPILE_TIME_SAMPLE.dyf.categories[0]!.groups[0]!.items).toHaveLength(3)
        const [stepper, radio, input] = COMPILE_TIME_SAMPLE.dyf.categories[0]!.groups[0]!.items
        expect(stepper!.scoreType.type).toBe('stepper')
        expect(radio!.scoreType.type).toBe('radio')
        expect(input!.scoreType.type).toBe('input')
    })
})

describe('UnitConfig 与契约种子结构对齐（防漂移）', () => {
    const seed = loadSeed()

    it('顶层字段与 schema 一致', () => {
        expect(seed.schemaVersion).toBe(1)
        expect(typeof seed.id).toBe('string')
        expect(typeof seed.name).toBe('string')
        expect(['draft', 'published', 'archived']).toContain(seed.status)
        expect(seed.unit).toBeTypeOf('object')
        expect(seed.class).toBeTypeOf('object')
        expect(Array.isArray(seed.student)).toBe(true)
        expect(seed.dyf).toBeTypeOf('object')
        expect(seed.calc).toBeTypeOf('object')
        expect(seed.rank).toBeTypeOf('object')
    })

    it('unit 绑定含二级单位与父级', () => {
        const unit = seed.unit as Record<string, unknown>
        expect(typeof unit.unitId).toBe('string')
        expect(['college', 'department', 'other']).toContain(unit.unitType)
        expect((unit.parentUnit as Record<string, unknown>).unitId).toBeTypeOf('string')
    })

    it('rank 只有 tieRule、无 scopes（决策 #21）', () => {
        const rank = seed.rank as Record<string, unknown>
        expect(['same-rank', 'dense']).toContain(rank.tieRule)
        expect(rank).not.toHaveProperty('scopes')
    })

    it('calc 判别字段 calcMode 有效', () => {
        const calc = seed.calc as Record<string, unknown>
        expect(['weighted', 'formula']).toContain(calc.calcMode)
        expect(typeof calc.dyfWeight).toBe('number')
        expect(typeof calc.courseWeight).toBe('number')
    })

    it('dyf 三层树，每个条目结构与新 DyfItem 对齐（scoreType 三态 / support 两态 / 内嵌标记）', () => {
        const categories = (seed.dyf as Record<string, unknown>).categories as Array<
            Record<string, unknown>
        >
        expect(Array.isArray(categories)).toBe(true)
        expect(categories.length).toBeGreaterThan(0)

        let itemCount = 0
        for (const category of categories) {
            expect(typeof category.penalty).toBe('boolean')
            expect(typeof category.studentRequired).toBe('boolean')
            expect(typeof category.adminRequired).toBe('boolean')
            const groups = category.groups as Array<Record<string, unknown>>
            for (const group of groups) {
                const items = group.items as Array<Record<string, unknown>>
                for (const item of items) {
                    itemCount++
                    // scoreType 判别式
                    const scoreType = item.scoreType as Record<string, unknown>
                    expect(['stepper', 'radio', 'input']).toContain(scoreType.type)
                    // support 已从「分值」翻转为「材料要求」对象
                    const support = item.support as Record<string, unknown>
                    expect(typeof support.need).toBe('boolean')
                    if (support.need === true) expect(typeof support.message).toBe('string')
                    // 内嵌标记
                    expect(typeof item.studentApplicable).toBe('boolean')
                    expect(typeof item.negative).toBe('boolean')
                    expect(typeof item.allowAdd).toBe('boolean')
                    expect(typeof item.adminEditable).toBe('boolean')
                }
            }
        }
        // 励行书院种子 106 项（README 记录），抽样确认非空且规模合理
        expect(itemCount).toBeGreaterThan(50)
    })

    it('radio 型条目带 options 数组、input/stepper 分值上限在 scoreType（非 support）', () => {
        const categories = (seed.dyf as Record<string, unknown>).categories as Array<
            Record<string, unknown>
        >
        const scoreTypes = categories
            .flatMap((c) => c.groups as Array<Record<string, unknown>>)
            .flatMap((g) => g.items as Array<Record<string, unknown>>)
            .map((i) => i.scoreType as Record<string, unknown>)

        for (const st of scoreTypes) {
            if (st.type === 'radio') {
                expect(Array.isArray(st.options)).toBe(true)
                expect((st.options as unknown[]).length).toBeGreaterThanOrEqual(2)
            }
            if (st.type === 'stepper') {
                expect(typeof st.min).toBe('number')
                expect(typeof st.step).toBe('number')
            }
        }
        // 至少存在一个 radio 型（励行书院四六级 313 是 radio）
        expect(scoreTypes.some((st) => st.type === 'radio')).toBe(true)
    })
})
