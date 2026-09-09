#!/usr/bin/env node
/**
 * 构建 @noble 供应商 bundle：shared/src/crypto/vendor/noble.js。
 *
 * 背景：微信「构建 npm」只按包 main 入口打成单一 bundle，且 @noble/* 主入口
 * 故意抛错（"root module cannot be imported: import submodules instead"），
 * 子路径导入（`@noble/ciphers/aes`）无法在微信解析。故用 esbuild 将小程序需要的
 * @noble 原语（gcm / sha256 / randomBytes）预打包为单一自包含 CJS 文件，
 * 随 shared 镜像（scripts/sync-shared.mjs）进入小程序。
 *
 * 用法：
 *   node scripts/build-noble-vendor.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = path.join(ROOT, 'src', 'crypto', 'vendor', 'noble-entry.ts')
const OUT = path.join(ROOT, 'src', 'crypto', 'vendor', 'noble.js')

// 优先用本地 esbuild（vite 依赖），否则回退 npx（Windows 需 .cmd）
const esbuildBin = [
  path.join(ROOT, 'node_modules', '.bin', 'esbuild.cmd'),
  path.join(ROOT, 'node_modules', '.bin', 'esbuild'),
].find((p) => existsSync(p))

const args = [
  ENTRY,
  '--bundle',
  '--format=cjs',
  '--platform=neutral',
  '--target=es2017',
  `--outfile=${OUT}`,
]

try {
  execFileSync(esbuildBin ?? 'esbuild', args, {
    stdio: 'inherit',
    cwd: ROOT,
    // Windows 下 .cmd 需经 shell 执行
    shell: process.platform === 'win32',
  })
  console.log(`[build-noble-vendor] 完成：${OUT}`)
} catch (error) {
  console.error(`[build-noble-vendor] 失败：${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
