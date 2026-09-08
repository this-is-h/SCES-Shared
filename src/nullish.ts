/**
 * ES2020 语法替代工具（内部使用，不对外导出）。
 *
 * 微信开发者工具的 JS 解析器（自动预览/上传管线）不支持 ES2020 语法
 * `?.`（可选链）与 `??`（空值合并），会报 `Unexpected token: punc (.)`。
 * 即便 tsc 配置了 `target: ES2017`，DevTools 预览管线也可能不按项目
 * tsconfig 降级，因此 shared 源码**不使用 `?.`/`??`**，统一用本模块的
 * 纯函数替代（语义完全等价，见决策 #12）：
 *
 *   a ?? b        →  nz(a, b)
 *   a?.b          →  opt(a, 'b')
 *   a?.b ?? c     →  nz(opt(a, 'b'), c)
 *
 * 注意：`nz(opt(a, 'b'), f())` 中 `f()` 作为实参**总会求值**（不同于 `??`
 * 的短路）；若后备值带副作用（如消耗随机数），请改用内联三元短路写法。
 */

/** `??`：值为 null/undefined 时取后备值。 */
export function nz<T>(value: T | null | undefined, fallback: T): T {
    return value === null || value === undefined ? fallback : value
}

/** `?.`：对象为 null/undefined 时安全取属性（返回 undefined）。 */
export function opt<T, K extends keyof T>(obj: T | null | undefined, key: K): T[K] | undefined {
    return obj === null || obj === undefined ? undefined : obj[key]
}
