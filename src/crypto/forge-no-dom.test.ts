/**
 * 小程序环境（无 window/self/process/global）下 node-forge 加载与加密验证。
 *
 * 背景：真机报 `Cannot read property 'crypto' of undefined` —— node-forge `util.globalScope`
 * 通过 `self`/`window` 探测全局对象（`typeof self === 'undefined' ? window : self`），
 * 小程序中二者均未定义 → `globalScope` 为 undefined → `random.js`/`prng.js` 加载时
 * 执行 `globalScope.crypto` 抛 TypeError。
 *
 * 修复（M2 落地，双保险）：
 * 1. **lib 级修补**（根治）：`scripts/patch-node-forge.mjs` 为 `util.js`（globalScope 增加
 *    globalThis 回退）与 `random.js`/`prng.js`（crypto 访问判空）打防御性补丁，
 *    修补 `user/wechat/miniprogram/node_modules/node-forge/lib/*.js` 与已构建的
 *    `miniprogram_npm/node-forge/index.js`（运行本测试前需先执行该脚本）；
 * 2. **env-shim**（兜底）：`utils/env-shim.ts` 将 `self` 指向全局对象（Web Worker 式全局），
 *    并在 `utils/crypto.ts` 中先于 node-forge 加载；
 * 3. `forge.random.seedFileSync` 覆盖为强随机池（否则 OAEP 种子退化 Math.random）。
 *
 * 本测试用 `node:vm` 模拟小程序全局环境，直接加载**小程序实际交付的 node-forge 副本**，验证：
 * 1. 补丁后无 shim 也能加载成功（globalScope 有回退，不崩溃）；
 * 2. `seedFileSync` 覆盖生效（forge.random 使用强随机池）；
 * 3. 小程序路径 RSA-OAEP 加密 → 管理端（WebCrypto）解密往返成功。
 */
import { describe, expect, it } from 'vitest'
import { createContext, runInContext, runInNewContext } from 'node:vm'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setCryptoProvider } from './provider'
import { webCryptoProvider } from './webcrypto'
import { testBatchKeyPair } from '../../docs/fixtures/test-batch-keypair'

/** 小程序实际交付的 node-forge（已由 scripts/patch-node-forge.mjs 修补）。 */
const FORGE_LIB_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../SCES-User-Wechat/miniprogram/node_modules/node-forge/lib',
)

/** 创建“小程序式”全局环境：无 process/global/self，window 已声明但为 undefined。 */
function createMiniProgramContext(): Record<string, unknown> {
  return createContext({ console, window: undefined })
}

/**
 * 迷你 CommonJS 加载器：仅解析相对路径，模拟小程序构建后的模块图。
 * 缓存 module 记录（正确处理 `module.exports = ...` 重赋值与循环引用）。
 */
function createForgeLoader(context: Record<string, unknown>) {
  const cache = new Map<string, { exports: unknown }>()
  const load = (fromDir: string, request: string): unknown => {
    if (!request.startsWith('.')) {
      // 非相对 require（如守卫内的 'crypto'）：无 process 环境下不会被真正执行
      return {}
    }
    const file = existsSync(`${path.resolve(fromDir, request)}.js`)
      ? `${path.resolve(fromDir, request)}.js`
      : null
    if (!file) {
      throw new Error(`无法解析模块：${request}`)
    }
    if (cache.has(file)) {
      return cache.get(file)!.exports
    }
    const module = { exports: {} as unknown }
    cache.set(file, module)
    const code = readFileSync(file, 'utf8')
    const sandbox = {
      module,
      exports: module.exports,
      require: (req: string) => load(path.dirname(file), req),
      __filename: file,
      __dirname: path.dirname(file),
      console,
      ...context,
    }
    const factory = runInNewContext(
      `(function(module, exports, require, __filename, __dirname) {\n${code}\n})`,
      sandbox,
      { filename: file },
    ) as (
      module: { exports: unknown },
      exports: unknown,
      require: (req: string) => unknown,
      filename: string,
      dirname: string,
    ) => void
    factory(module, module.exports, sandbox.require, file, path.dirname(file))
    return module.exports
  }
  return (request: string) => {
    // 入口：'node-forge' → lib/index.js；模块内部均为相对 require
    if (request === 'node-forge') {
      return load(FORGE_LIB_DIR, './index')
    }
    return load(FORGE_LIB_DIR, request)
  }
}

/** base64url → 字节。 */
function b64urlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const bin = Buffer.from(b64, 'base64')
  return new Uint8Array(bin)
}

/** 字节 → hex。 */
function bytesToHex(bytes: Uint8Array): string {
  let result = ''
  for (const b of bytes) {
    result += b.toString(16).padStart(2, '0')
  }
  return result
}

/** 字节 → “二进制字符串”（forge 输入格式）。 */
function bytesToBinaryString(bytes: Uint8Array): string {
  let result = ''
  for (const b of bytes) {
    result += String.fromCharCode(b)
  }
  return result
}

/** 模拟 utils/crypto.ts 的强随机池 + seedFileSync 覆盖。 */
function installPoolSeeding(forge: Record<string, unknown>, pool: Uint8Array) {
  let offset = 0
  let seedCalls = 0
  const seedFileSync = (needed: number): string => {
    seedCalls += 1
    const out = pool.slice(offset, offset + needed)
    offset += needed
    return bytesToBinaryString(out)
  }
  ;(forge.random as { seedFileSync?: (needed: number) => string }).seedFileSync = seedFileSync
  return { getSeedCalls: () => seedCalls, getOffset: () => offset }
}

describe('node-forge 在无 DOM 环境（小程序模拟，已修补副本）', () => {
  it('无 shim 也能加载成功（lib 补丁：globalScope 有 globalThis 回退，不崩溃）', () => {
    const context = createMiniProgramContext()
    const require = createForgeLoader(context)
    const forge = require('node-forge') as {
      util: { globalScope: unknown; isNodejs: unknown }
      random: unknown
    }
    expect(forge.util.globalScope).toBeTruthy()
    expect(forge.util.isNodejs).toBeFalsy()
    expect(forge.random).toBeTruthy()
  })

  it('shim（self = globalThis）后加载成功，globalScope 指向有效对象', () => {
    const context = createMiniProgramContext()
    runInContext('this.self = this', context)
    const require = createForgeLoader(context)
    const forge = require('node-forge') as {
      util: { globalScope: unknown; isNodejs: unknown }
      random: unknown
    }
    expect(forge.util.globalScope).toBeTruthy()
    expect(forge.util.isNodejs).toBeFalsy()
    expect(forge.random).toBeTruthy()
  })

  it('覆盖 seedFileSync 后 forge.random 走强随机池（RSA-OAEP 种子路径）', () => {
    const context = createMiniProgramContext()
    runInContext('this.self = this', context)
    const require = createForgeLoader(context)
    const forge = require('node-forge') as { random: { getBytes: (n: number) => string } }
    const pool = new Uint8Array(4096)
    globalThis.crypto.getRandomValues(pool)
    const seeding = installPoolSeeding(forge, pool)
    const bytes = forge.random.getBytes(32)
    expect(bytes.length).toBe(32)
    // seedFileSync 必须被调用（否则走的是 Math.random 弱熵路径）
    expect(seeding.getSeedCalls()).toBeGreaterThan(0)
  })

  it('小程序路径 RSA-OAEP 加密 → 管理端（WebCrypto）解密往返', async () => {
    const context = createMiniProgramContext()
    runInContext('this.self = this', context)
    const require = createForgeLoader(context)
    const forge = require('node-forge') as {
      pki: {
        setRsaPublicKey: (
          n: unknown,
          e: unknown,
        ) => { encrypt: (msg: string, scheme: string, opts: unknown) => string }
      }
      jsbn: { BigInteger: new (hex: string, radix: number) => unknown }
      md: { sha256: { create: () => unknown } }
      random: { getBytes: (n: number) => string }
    }
    const pool = new Uint8Array(4096)
    globalThis.crypto.getRandomValues(pool)
    installPoolSeeding(forge, pool)

    // 与 portable-provider 相同的公钥导入方式（JWK n/e → forge BigInteger）
    const jwk = testBatchKeyPair.publicKeyJwk
    const publicKey = forge.pki.setRsaPublicKey(
      new forge.jsbn.BigInteger(bytesToHex(b64urlToBytes(jwk.n!)), 16),
      new forge.jsbn.BigInteger(bytesToHex(b64urlToBytes(jwk.e!)), 16),
    )

    const message = 'hello-miniprogram'
    const cipher = publicKey.encrypt(message, 'RSA-OAEP', {
      md: forge.md.sha256.create(),
      mgf1: { md: forge.md.sha256.create() },
    })

    // 管理端：WebCrypto 用测试批次私钥解密（与 shared webcrypto provider 相同路径）
    // 注意：shared tsconfig 无 DOM 类型，此处用最小结构化接口
    setCryptoProvider(webCryptoProvider)
    const subtle = (
      globalThis as unknown as {
        crypto: {
          subtle: {
            importKey(
              format: string,
              keyData: Record<string, unknown>,
              algorithm: Record<string, unknown>,
              extractable: boolean,
              keyUsages: string[],
            ): Promise<unknown>
            decrypt(
              algorithm: Record<string, unknown>,
              key: unknown,
              data: Uint8Array,
            ): Promise<ArrayBuffer>
          }
        }
      }
    ).crypto.subtle
    const privateKey = await subtle.importKey(
      'jwk',
      testBatchKeyPair.privateKeyJwk as unknown as Record<string, unknown>,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt'],
    )
    const decryptedBuf = await subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      Uint8Array.from(cipher, (c) => c.charCodeAt(0)),
    )
    const decrypted = new TextDecoder().decode(decryptedBuf)
    expect(decrypted).toBe(message)
  })
})
