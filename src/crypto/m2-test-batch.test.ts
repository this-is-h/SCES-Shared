/**
 * M2 gating 测试：学生端（小程序）内置测试批次公钥加密 → 管理端（WebCrypto）私钥解密。
 *
 * 验证 M2 离线闭环的核心链路：
 * - `docs/fixtures/test-batch-keypair.ts` 的公钥（node-forge 可移植 provider 加密，
 *   即小程序导出路径）；
 * - `docs/fixtures/test-batch-keypair.ts` 中的私钥（WebCrypto 解密，即管理端导入路径）；
 * - 加密产物为合法 .dyf（含 applyId/revision/batchId/hash），payload 通过申请校验。
 *
 * 注意：本测试依赖 M2 内置测试批次夹具，若夹具路径变动请同步更新。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { setCryptoProvider } from './provider'
import { webCryptoProvider } from './webcrypto'
import { createPortableProvider } from './portable-provider'
import { decryptDyfFile, encryptPayload } from './hybrid'
import { validateApplyPayload } from '../validate/apply'
import { testBatchId, testBatchKeyPair } from '../../docs/fixtures/test-batch-keypair'

/** 模拟小程序注入 wx.getRandomValues（Node 环境用内置密码学随机源）。 */
const portableProvider = createPortableProvider({
  randomBytes: (length) => {
    const bytes = new Uint8Array(length)
    globalThis.crypto.getRandomValues(bytes)
    return bytes
  },
})

describe('M2 学生端申请（内置测试批次）', () => {
  beforeAll(() => {
    setCryptoProvider(webCryptoProvider)
  })

  it('测试批次公钥与夹具私钥匹配（密钥对自洽）', async () => {
    setCryptoProvider(portableProvider)
    const file = await encryptPayload({
      payload: { ping: true },
      publicKeyJwk: testBatchKeyPair.publicKeyJwk,
      type: 'apply',
    })
    setCryptoProvider(webCryptoProvider)
    const result = await decryptDyfFile({
      file,
      privateKeyJwk: testBatchKeyPair.privateKeyJwk,
    })
    expect(result.payload).toEqual({ ping: true })
  })

  it('学生端加密 .dyf（portable）→ 管理端解密（webcrypto），payload 完整且校验通过', async () => {
    const payload = {
      applyId: 'test-apply-0001',
      revision: 1,
      batchId: testBatchId,
      personal: {
        name: '张三',
        studentId: '20251234567',
        phone: '13800000000',
        grade: '2025',
        major: '计算机科学与技术',
        className: '计科 2501',
        year: 2025,
        semester: 2,
      },
      dyf: {
        '111': { score: 2 },
        '8882': { score: 1, evidence: ['ZmFrZS1iYXNlNjQ='] },
      },
      confirmSlip: 'ZmFrZS1jb25maXJtLXNsaXA=',
    }

    // 学生端：可移植 provider + 测试批次公钥加密
    setCryptoProvider(portableProvider)
    const file = await encryptPayload({
      payload,
      publicKeyJwk: testBatchKeyPair.publicKeyJwk,
      type: 'apply',
      applyId: payload.applyId,
      revision: payload.revision,
      batchId: payload.batchId,
    })
    expect(file.encrypted).toBe(true)
    expect(file.applyId).toBe(payload.applyId)
    expect(file.revision).toBe(payload.revision)
    expect(file.batchId).toBe(payload.batchId)
    expect(file.hash).toMatch(/^[0-9a-f]{64}$/)

    // 管理端：webcrypto + 夹具私钥解密
    setCryptoProvider(webCryptoProvider)
    const result = await decryptDyfFile({
      file,
      privateKeyJwk: testBatchKeyPair.privateKeyJwk,
    })
    expect(result.type).toBe('apply')
    expect(result.payload).toEqual(payload)
    expect(result.hash).toBe(file.hash)

    // 申请 payload 通过共享层校验（M3 导入侧复用同一校验）
    const validation = validateApplyPayload(
      result.payload as Parameters<typeof validateApplyPayload>[0],
    )
    expect(validation.ok).toBe(true)
    expect(validation.errors).toEqual([])
  })

  it('篡改 .dyf 数据导致完整性校验失败', async () => {
    setCryptoProvider(portableProvider)
    const file = await encryptPayload({
      payload: {
        applyId: 'test-apply-0002',
        revision: 1,
        batchId: testBatchId,
        personal: { name: '李四', studentId: '20259876543' },
        dyf: {},
      },
      publicKeyJwk: testBatchKeyPair.publicKeyJwk,
      type: 'apply',
    })
    file.data = `${file.data!.slice(0, 1) === 'A' ? 'B' : 'A'}${file.data!.slice(1)}`
    setCryptoProvider(webCryptoProvider)
    await expect(
      decryptDyfFile({ file, privateKeyJwk: testBatchKeyPair.privateKeyJwk }),
    ).rejects.toThrow()
  })
})
