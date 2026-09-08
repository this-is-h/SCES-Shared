/**
 * 授权文件错误。
 *
 * 为什么要一个带 code 的错误类型而不是裸 `Error`：
 * 激活失败的每种原因对应**不同的用户动作**（换文件 / 重输口令 / 联系服务商换机 / 升级软件），
 * 上层要能按 code 分支。文案在这里定死，避免每个调用点各写一版。
 */

export type LicenseErrorCode =
  /** 不是 dys* 文件，或 JSON 损坏，或 type 不符 */
  | "not-a-license"
  /** schemaVersion 高于本程序支持的版本 */
  | "unsupported-version"
  /** sig.signKeyId 不在 __DMS_LICENSE_VERIFY_KEYS__ 里 */
  | "unknown-sign-key"
  /** 验签失败：header / 密文 / 哈希 任一被改动 */
  | "bad-signature"
  /** boundFingerprint 与本机机器码不符 */
  | "fingerprint-mismatch"
  /** AES-GCM 解密失败，几乎总是口令错 */
  | "bad-password"
  /** GCM 通过但 enc.hash 不符：文件内容损坏 */
  | "content-corrupt"
  /** .dysd 内嵌单位证书验签失败 */
  | "cert-bad-signature"
  /** .dysd header.signKeyId 与内嵌证书的签发公钥 keyId 不一致 */
  | "sign-key-mismatch"
  /** .dysd header.unitId 与内嵌证书的 unitId 不一致 */
  | "unit-mismatch"
  /** .dysd 有效期超出单位证书 notAfter（级联到期强制） */
  | "expiry-exceeds-cert"
  /** .dysd boundFingerprint 与本机不符（联系单位管理员，而非服务商） */
  | "delegated-fingerprint-mismatch"
  /** .dysd 角色与数据范围不完整。 */
  | "delegated-scope-invalid";

/** 面向最终用户的中文文案。直接透传到界面，不再二次包装。 */
export const LICENSE_ERROR_MESSAGES: Record<LicenseErrorCode, string> = {
  "not-a-license": "不是有效的授权文件",
  "unsupported-version": "授权文件版本过新，请升级软件",
  "unknown-sign-key": "授权文件签名密钥未知，请升级软件",
  "bad-signature": "授权文件无效或已被篡改",
  "fingerprint-mismatch": "该授权文件已绑定到其他设备，请联系服务商换机",
  "bad-password": "口令不正确",
  "content-corrupt": "授权文件内容校验失败",
  "cert-bad-signature": "单位证书无效或已被篡改",
  "sign-key-mismatch": "授权文件与单位证书的签发密钥不一致",
  "unit-mismatch": "授权文件与单位证书的单位不一致",
  "expiry-exceeds-cert":
    "下级授权有效期超出单位授权有效期，请向单位管理员索取新的授权文件",
  "delegated-fingerprint-mismatch":
    "该授权文件已绑定到其他设备，请联系单位管理员重新签发",
  "delegated-scope-invalid":
    "授权文件的数据范围不完整，请联系单位管理员重新签发",
};

/** 授权文件错误。`message` 默认取 `LICENSE_ERROR_MESSAGES[code]`，可追加细节。 */
export class LicenseError extends Error {
  readonly code: LicenseErrorCode;

  constructor(code: LicenseErrorCode, detail?: string) {
    const base = LICENSE_ERROR_MESSAGES[code];
    super(detail ? `${base}（${detail}）` : base);
    this.name = "LicenseError";
    this.code = code;
  }
}
