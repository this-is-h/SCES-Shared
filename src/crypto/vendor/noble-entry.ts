/**
 * esbuild 打包入口（仅供 scripts 构建使用，不进小程序镜像，见 sync-shared.mjs 排除规则）。
 *
 * 背景：微信「构建 npm」只按包 main 入口打包成单一 bundle，且 @noble/* 主入口
 * 故意抛错（"root module cannot be imported: import submodules instead"），
 * 子路径导入（`@noble/ciphers/aes`）无法在微信解析。因此把小程序需要的 @noble 原语
 * 预打包为单一 CJS 文件 `shared/src/crypto/vendor/noble.js`（自包含，随镜像进小程序）。
 *
 * 构建命令：
 *   esbuild shared/src/crypto/vendor/noble-entry.ts --bundle --format=cjs \
 *     --platform=neutral --target=es2017 --outfile=shared/src/crypto/vendor/noble.js
 */
export { gcm } from '@noble/ciphers/aes'
export { sha256 } from '@noble/hashes/sha256'
export { randomBytes } from '@noble/hashes/utils'
