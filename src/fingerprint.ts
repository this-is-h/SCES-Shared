/**
 * 机器码（fingerprint）—— 把授权文件绑定到一台机器。
 *
 * 设计约束（`dual-mode/03-offline-license.md` §3）：
 * - 跨平台、无原生依赖：不读注册表、不读硬盘序列号（需提权，且会触发杀软告警）。
 * - 可口述：base32 字母表去掉易混字符，用户能在电话里念给服务商。
 * - 重装软件后稳定：只用操作系统层面的稳定量，不含随机值（这是它与
 *   `services/license.ts` 里 `installId` 的本质区别——后者是随机 UUID，可被复制）。
 *
 * 本文件**只在 Node 侧使用**（管理端主进程 + 服务商 CLI）：
 * 依赖 `node:os` 与 `node:crypto`，因此不镜像进小程序、不从 `shared/src/index.ts` 导出。
 */
import { createHash } from "node:crypto";
import os from "node:os";

/**
 * Crockford Base32 字母表：**恰好 32 个字符**，5 bit 一个字符正好整除。
 *
 * 为什么不是方案初稿写的 `23456789ABCDEFGHJKMNPQRSTUVWXYZ`：那是 **31** 个字符
 * （36 个字母数字去掉 `0 O 1 I L`），5 bit 有 32 种取值，索引 31 会越界取到
 * `undefined` 并把字符串 "undefined" 拼进机器码。base32 字母表必须是 32 个。
 *
 * Crockford 的取舍更优：它去掉 `I L O U`——保留 `0`/`1` 但删掉它们的字形孪生
 * （`O`/`I`/`L`），于是**任何一对字符都不再形似**（歧义需要两个成员同时在场）；
 * 额外去掉 `U` 是为了避免随机串拼出不雅词。
 */
export const FINGERPRINT_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 机器码字符数（不含分隔符）。 */
export const FINGERPRINT_LENGTH = 12;

/**
 * 采集本机指纹原料，`|` 连接。
 * 独立导出便于排障：换机争议时可以让用户打印这一串，直接看出是哪一项变了。
 */
export function fingerprintRawParts(): string {
  let username = "unknown-user";
  try {
    username = os.userInfo().username || username;
  } catch {
    username = process.env.USERNAME || process.env.USER || username;
  }
  return [
    os.hostname(),
    os.platform(),
    os.arch(),
    firstNonLoopbackMac(),
    username,
  ].join("|");
}

/** 原料串 → 机器码。纯函数，便于单测与跨机复算。 */
export function fingerprintFromRaw(raw: string): string {
  const digest = createHash("sha256").update(raw, "utf8").digest();
  let code = "";
  // 每 5 bit 取一个字符：12 个字符需要 60 bit，即前 8 字节足够（32 字符表整除 5 bit）
  let acc = 0;
  let bits = 0;
  for (let i = 0; code.length < FINGERPRINT_LENGTH; i++) {
    acc = (acc << 8) | digest[i]!;
    bits += 8;
    while (bits >= 5 && code.length < FINGERPRINT_LENGTH) {
      bits -= 5;
      code += FINGERPRINT_ALPHABET[(acc >> bits) & 0x1f];
    }
    acc &= (1 << bits) - 1;
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

/** 计算本机机器码，形如 `K7QX-M4NP-8ZR2`。 */
export function computeFingerprint(): string {
  return fingerprintFromRaw(fingerprintRawParts());
}

/**
 * 按接口名排序后取第一个非全零 MAC。
 * 排序是必需的：`os.networkInterfaces()` 的键序不保证稳定，
 * 不排序会导致同一台机器在不同次启动算出不同机器码。
 */
function firstNonLoopbackMac(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces).sort()) {
    for (const info of ifaces[name] || []) {
      if (!info.internal && info.mac && info.mac !== "00:00:00:00:00:00") {
        return info.mac;
      }
    }
  }
  // 无网卡（极少见：容器 / 禁用全部适配器）时退化为空槽位，
  // 机器码仍可算出，只是绑定强度下降；不抛错，否则用户直接进不了激活页。
  return "no-mac";
}
