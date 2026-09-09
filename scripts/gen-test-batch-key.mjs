#!/usr/bin/env node
/**
 * 生成 shared 层 gating 测试用的测试批次 RSA 密钥对（TEST ONLY —— 禁止用于任何生产批次）。
 *
 * 用途：shared 测试（crypto/m2-test-batch、import/m3-flow）用可移植 provider（node-forge，
 * 即小程序导出路径）以公钥加密 .dyf，用 WebCrypto（即管理端导入路径）以私钥解密，验证离线
 * 加解密闭环。密钥对通过 Node WebCrypto（与 shared webcrypto provider 相同生成路径）生成。
 *
 * 输出：docs/fixtures/test-batch-keypair.ts —— 完整密钥对（公钥 + 私钥）+ 固定 testBatchId。
 *   仅测试用；私钥绝不进入任何端产物。
 *
 * 说明：批次公钥自 M5 起由服务端接口下发（`.dysk → cert:issue → 编译进包` 的离线回环已随
 *   离线版下线移除）；本脚本仅用于重新生成测试夹具，不写任何小程序侧文件。
 *
 * 用法：
 *   node scripts/gen-test-batch-key.mjs
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const FIXTURE_PATH = path.join(ROOT, 'docs', 'fixtures', 'test-batch-keypair.ts')

// 固定的测试批次 id（供 shared 测试引用；与真实派生批次 id 无关，仅需稳定）。
const TEST_BATCH_ID = '7b3f6c8e-4a5b-4c6d-9e8f-1a2b3c4d5e6f'

async function main() {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  )

  const publicKeyJwk = await globalThis.crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privateKeyJwk = await globalThis.crypto.subtle.exportKey('jwk', keyPair.privateKey)

  const fixture = [
    '/**',
    ' * 测试批次密钥对（TEST ONLY —— 禁止用于任何生产批次）。',
    ' *',
    ' * 由 `scripts/gen-test-batch-key.mjs` 生成（Node WebCrypto，RSA-OAEP-2048/SHA-256，',
    ' * 与 shared webcrypto provider 相同生成路径）。私钥仅存本夹具，供 shared 层 gating',
    ' * 测试（crypto/m2-test-batch、import/m3-flow）用作自洽 RSA 对；不进入任何端产物。',
    ' */',
    'import type { Jwk } from "../../src/types/common"',
    '',
    "export const testBatchId = '" + TEST_BATCH_ID + "'",
    '',
    'export const testBatchPublicKeyJwk: Jwk = ' + JSON.stringify(publicKeyJwk, null, 2),
    '',
    'export const testBatchPrivateKeyJwk: Jwk = ' + JSON.stringify(privateKeyJwk, null, 2),
    '',
    'export const testBatchKeyPair = {',
    '  publicKeyJwk: testBatchPublicKeyJwk,',
    '  privateKeyJwk: testBatchPrivateKeyJwk,',
    '}',
    '',
  ].join('\n')

  await writeFile(FIXTURE_PATH, fixture, 'utf8')
  console.log(`[gen-test-batch-key] 密钥对已写入 ${FIXTURE_PATH}`)
  console.log('[gen-test-batch-key] 完成。注意：私钥仅存夹具，请勿用于任何生产批次。')
}

main().catch((error) => {
  console.error(`[gen-test-batch-key] 失败：${error.message}`)
  process.exit(1)
})
