/**
 * M2 端到端验证脚本：模拟管理端解密学生端导出的 .dyf 文件。
 *
 * 用法：
 *   1. 学生端导出 .dyf 文件 → 传到电脑
 *   2. 确保私钥与 testBatch.ts 中的公钥匹配
 *   3. `npx tsx verify-decrypt.mjs <path/to/file.dyf>`
 *
 * 输出：解密后的 payload JSON + 完整性校验结果
 */
import { readFileSync } from 'fs'
import { setCryptoProvider } from './src/crypto/webcrypto.js'
import { decryptDyfFile } from './src/crypto/hybrid.js'
import { validateApplyPayload } from './src/validate/apply.js'

// 从 gen-key-output.json 读取私钥
const keyData = JSON.parse(readFileSync(new URL('../gen-key-output.json', import.meta.url), 'utf8'))
const privateKeyJwk = keyData.privateKeyJwk

const filePath = process.argv[2]
if (!filePath) {
  console.error('用法: node verify-decrypt.mjs <path/to/file.dyf>')
  process.exit(1)
}

const fileContent = readFileSync(filePath, 'utf8')
const dyfFile = JSON.parse(fileContent)

console.log('📄 .dyf 文件元信息:')
console.log(`   schemaVersion: ${dyfFile.schemaVersion}`)
console.log(`   type: ${dyfFile.type}`)
console.log(`   encrypted: ${dyfFile.encrypted}`)
console.log(`   applyId: ${dyfFile.applyId}`)
console.log(`   revision: ${dyfFile.revision}`)
console.log(`   batchId: ${dyfFile.batchId}`)
console.log(`   hash: ${dyfFile.hash?.slice(0, 16)}...`)

setCryptoProvider(webCryptoProvider)

try {
  const result = await decryptDyfFile({ file: dyfFile, privateKeyJwk })
  console.log('\n✅ 解密成功!')
  console.log(`   hash 校验: 通过`)
  console.log(`   type: ${result.type}`)

  const payload = result.payload
  const validation = validateApplyPayload(payload)
  console.log(`   payload 校验: ${validation.ok ? '✅ 通过' : '❌ 失败: ' + validation.errors.join(', ')}`)
  console.log(`   applyId: ${payload.applyId}`)
  console.log(`   revision: ${payload.revision}`)
  console.log(`   batchId: ${payload.batchId}`)
  console.log(`   姓名: ${payload.personal?.name}`)
  console.log(`   学号: ${payload.personal?.studentId}`)
  console.log(`   dyf 项目数: ${Object.keys(payload.dyf || {}).length}`)
  if (payload.confirmSlip) {
    console.log(`   确认单: ${payload.confirmSlip.slice(0, 40)}... (${payload.confirmSlip.length} chars)`)
  }
} catch (err) {
  console.error('\n❌ 解密失败:', err.message)
  process.exit(1)
}