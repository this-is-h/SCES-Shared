/**
 * 烟测：管理端间数据交换 .dxy 的加解密往返（issue #4/#5 的核心加密路径）。
 * 复用与 exchange.ts 相同的 shared 原语：encryptPayload(type:'exchange') + 批次公钥 → decryptDyfFile 批次私钥。
 * 运行：npx tsx scripts/smoke-exchange.mts
 */
import {
  useWebCryptoProvider,
  generateRsaKeyPair,
  encryptPayload,
  decryptDyfFile
} from '../shared/src/index'

useWebCryptoProvider()

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('[smoke-exchange] 断言失败:', msg)
    process.exit(1)
  }
}

const batch = await generateRsaKeyPair()
const other = await generateRsaKeyPair()

// 与 exchange.ts ExchangePayload 同构的样例（一个班上交年级）
const payload = {
  exchangeVersion: 1,
  batchId: 'B-smoke-001',
  year: 2025,
  semester: 2,
  fromRole: 'level3',
  fromScope: { class: '测试专业1班' },
  exportedAt: Date.now(),
  students: [
    { studentId: '12558699964', name: '胡立', phone: '16727143456', grade: '2024', major: '测试专业', className: '测试专业1班' },
    { studentId: '12558699965', name: '胡立鹏', phone: null, grade: '2024', major: '测试专业', className: '测试专业1班' }
  ],
  applies: [
    {
      applyId: 'A-1',
      studentId: '12558699964',
      status: 'confirmed',
      currentRevision: 1,
      scores: [
        { itemCode: '111', category: '基础分', appliedScore: 10, finalScore: 8, maxScore: 10, allowAdd: false },
        { itemCode: '211', category: '奖励分', appliedScore: 5, finalScore: null, maxScore: null, allowAdd: true }
      ]
    }
  ]
}

// 1) 用批次公钥加密为 type:'exchange' 文件
const file = await encryptPayload({
  payload,
  publicKeyJwk: batch.publicKeyJwk,
  type: 'exchange',
  batchId: payload.batchId
})
assert(file.type === 'exchange', "文件 type 应为 'exchange'")
assert(file.encrypted === true, '文件应加密')
assert(typeof file.hash === 'string' && file.hash.length === 64, '应内嵌 SHA-256 完整性哈希')

// 2) 用批次私钥解密并校验哈希，payload 应逐字段还原
const decrypted = await decryptDyfFile({ file, privateKeyJwk: batch.privateKeyJwk })
assert(decrypted.type === 'exchange', "解密结果 type 应为 'exchange'")
assert(
  JSON.stringify(decrypted.payload) === JSON.stringify(payload),
  'payload 往返不一致（存储 = 传输 = 还原）'
)
const rt = decrypted.payload as typeof payload
assert(rt.students.length === 2 && rt.applies[0].scores.length === 2, '学生/明细数应完整还原')
assert(rt.applies[0].scores[0].finalScore === 8, 'finalScore 应保真（上级复核基线）')

// 3) 用其他单位/批次私钥应无法解密（机密性）
let rejected = false
try {
  await decryptDyfFile({ file, privateKeyJwk: other.privateKeyJwk })
} catch {
  rejected = true
}
assert(rejected, '非本批次私钥应无法解密（机密性边界）')

console.log('[smoke-exchange] 全部断言通过（加密/type/哈希/往返保真/finalScore/机密性）')
