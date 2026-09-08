/**
 * M3 gating 测试：德育分离线闭环（导入 → 判定 → 归一化 → 总分 → 排名）。
 *
 * 模拟管理端导入流程的共享层链路（不含 SQLite 落库，DB 层在 desktop 主进程）：
 *   学生端（portable provider + 测试批次公钥）加密 .dyf
 *   → 管理端（webcrypto + 夹具私钥）解密 + 完整性校验
 *   → payload 校验（validateApplyPayload）
 *   → 学号冲突判定（checkImport：accept / conflict / reject）
 *   → 明细归一化（normalizeImportDyf：category/allowAdd/maxScore 由模板解析）
 *   → 德育分总分（calcDyfTotal：惩罚分类目为负）
 *   → 排名（calcRank：same-rank 并列）
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { UnitConfig } from '../types'
import { setCryptoProvider } from '../crypto/provider'
import { webCryptoProvider } from '../crypto/webcrypto'
import { createPortableProvider } from '../crypto/portable-provider'
import { decryptDyfFile, encryptPayload } from '../crypto/hybrid'
import { validateApplyPayload } from '../validate/apply'
import { checkImport } from '../validate/conflict'
import { normalizeImportDyf } from './normalize'
import { calcDyfTotal, extractDyfTotalConfig } from '../calc/dyf-total'
import { calcRank } from '../calc/rank'
import { testBatchId, testBatchKeyPair } from '../../docs/fixtures/test-batch-keypair'

/** 模拟小程序注入 wx.getRandomValues（Node 环境用内置密码学随机源）。 */
const portableProvider = createPortableProvider({
  randomBytes: (length) => {
    const bytes = new Uint8Array(length)
    globalThis.crypto.getRandomValues(bytes)
    return bytes
  },
})

/** nxu/lx 结构的最小配置（与真实配置对齐：8882 在「第八项第三条」类，惩罚分是独立类别）。 */
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
                code: '111',
                description: '思想品德',
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
                code: '222',
                description: '社会实践',
                scoreType: { type: 'stepper', min: 0, max: 10, step: 1 },
                support: { need: false },
                studentApplicable: true,
                studentRequired: false,
                adminEditable: true,
                adminRequired: false,
                allowAdd: true,
                negative: false,
              },
            ],
          },
        ],
      },
      {
        code: 'item8',
        name: '第八项第三条',
        studentRequired: false,
        adminRequired: false,
        penalty: false,
        groups: [
          {
            code: 'g2',
            name: '其他扣分项',
            items: [
              {
                code: '8882',
                description: '其他扣分',
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
            code: 'g3',
            name: '违纪处分类',
            items: [
              {
                code: '1511',
                description: '留校察看处分',
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
}

describe('M3 德育分闭环（共享层链路）', () => {
  beforeAll(() => {
    setCryptoProvider(webCryptoProvider)
  })

  it('学生端导出 → 管理端解密 → 校验 → 归一化 → 总分（负分项与惩罚分类目取负）', async () => {
    const payload = {
      applyId: 'apply-m3-0001',
      revision: 1,
      batchId: testBatchId,
      personal: { name: '张三', studentId: '20250001', className: '计科 2501', grade: '2025', major: '计算机' },
      dyf: {
        '111': { score: 2 },
        '222': { score: 8, evidence: ['ZmFrZQ=='] },
        '8882': { score: 1 },
        '1511': { score: 40 },
      },
    }

    // 学生端加密
    setCryptoProvider(portableProvider)
    const file = await encryptPayload({
      payload,
      publicKeyJwk: testBatchKeyPair.publicKeyJwk,
      type: 'apply',
      applyId: payload.applyId,
      revision: payload.revision,
      batchId: payload.batchId,
    })

    // 管理端解密 + 校验
    setCryptoProvider(webCryptoProvider)
    const result = await decryptDyfFile({ file, privateKeyJwk: testBatchKeyPair.privateKeyJwk })
    expect(result.hash).toBe(file.hash)
    const validation = validateApplyPayload(result.payload as Parameters<typeof validateApplyPayload>[0])
    expect(validation.ok).toBe(true)

    // 学号冲突判定：首次导入 → accept
    const decision = checkImport({
      studentId: (result.payload as { personal: { studentId: string } }).personal.studentId,
      name: (result.payload as { personal: { name: string } }).personal.name,
    })
    expect(decision.decision).toBe('accept')

    // 归一化：分类 code / allowAdd / maxScore 由配置解析（决策 #36：category 存 code）
    const { scores, unknownItems } = normalizeImportDyf(result.payload as never, template)
    expect(unknownItems).toEqual([])
    expect(scores).toHaveLength(4)
    const byCode = Object.fromEntries(scores.map((s) => [s.itemCode, s]))
    expect(byCode['222']).toMatchObject({ category: 'base', allowAdd: true, maxScore: 10 })
    // 8882 在「第八项第三条」类（item8）：不命中惩罚分类，由 negative 标记单项取负
    expect(byCode['8882']).toMatchObject({ category: 'item8', allowAdd: false })
    expect(byCode['1511']).toMatchObject({ category: 'penalty', allowAdd: false })

    // 总分（标记驱动）：2 + 8 - 1（8882 negative 单项取负）- 40（penalty 类目小计取负）= -31
    const total = calcDyfTotal(
      scores.map((s) => ({ categoryCode: s.category, itemNumber: s.itemCode, score: s.appliedScore })),
      extractDyfTotalConfig(template),
    )
    expect(total).toBe(-31)
  })

  it('重复导入（同学号同姓名已存在）→ reject；同号异名未锁定 → conflict', () => {
    // 已存在：张三 / 20250001，且申请已导入
    const duplicate = checkImport({
      studentId: '20250001',
      name: '张三',
      existing: {
        studentId: '20250001',
        name: '张三',
        idConflictLocked: false,
        nameCorrected: false,
        applyStatus: 'imported',
      },
    })
    expect(duplicate.decision).toBe('reject')

    const conflict = checkImport({
      studentId: '20250001',
      name: '张三三',
      existing: {
        studentId: '20250001',
        name: '张三',
        idConflictLocked: false,
        nameCorrected: false,
      },
    })
    expect(conflict.decision).toBe('conflict')

    // 锁定后同号异名 → reject
    const locked = checkImport({
      studentId: '20250001',
      name: '王五',
      existing: {
        studentId: '20250001',
        name: '张三',
        idConflictLocked: true,
        nameCorrected: false,
      },
    })
    expect(locked.decision).toBe('reject')
  })

  it('确认后排名：同分同名次（same-rank），按分数降序', () => {
    const ranked = calcRank(
      [
        { studentId: 'a', score: 9 },
        { studentId: 'b', score: 9 },
        { studentId: 'c', score: 7 },
      ],
      { tieRule: 'same-rank' },
    )
    const byId = Object.fromEntries(ranked.map((r) => [r.studentId, r.rank]))
    expect(byId).toEqual({ a: 1, b: 1, c: 3 })
  })
})
