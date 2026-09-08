/**
 * `.dysd` 下级授权文件:一级签发(issue)+ 二三级离线验证链(verify/open)。
 *
 * 信任链(dual-mode/12 §3):编译进包的服务商公钥 → 内嵌 .dysc → 单位签发公钥 → .dysd。
 * 二三级无需联网、无需预置该单位任何信息即可验真伪。
 * 全部密码学路径由 dual-mode/poc/role-delegation.mjs 跑通(20/20,含 8 条攻击路径)。
 */
import type { Batch, Jwk, UnitConfig } from "../types";
import { LicenseError } from "./errors";
import { signEnvelope, verifyEnvelope } from "./envelope";
import { openSecret, sealSecret } from "./seal";
import { asUnitCert, verifyPayloadWithKey } from "./unit-cert";
import type { UnitCertFile } from "./unit-cert";
import { LICENSE_SCHEMA_VERSION } from "./types";
import type {
  FileSignature,
  LicenseRole,
  LicenseScope,
  SealedSection,
  VerifyKey,
} from "./types";

/** 下级角色:一级只能签发 level2/level3(授权仅两层)。 */
export type DelegatedRole = Exclude<LicenseRole, "level1">;

/** `.dysd` 明文头:验签前即可展示(发给谁、何时到期)。 */
export interface DelegatedLicenseHeader {
  delegationId: string;
  unitId: string;
  /** 恒为 level2/level3;运行期若见 level1 说明被篡改,由步骤④拦截。 */
  role: LicenseRole;
  scope: LicenseScope;
  issuedBy: string;
  issuedAt: number;
  expiresAt: number;
  /** null = 不绑设备(浮动)。 */
  boundFingerprint: string | null;
  /** 必须 = unitCert.payload.signKey.keyId。 */
  signKeyId: string;
}

/** 随 .dysd 下发的申请密钥(含私钥,供二三级解密学生 .dyf)。 */
export interface DelegatedApplyKey {
  keyId: string;
  current: boolean;
  publicKeyJwk: Jwk;
  privateKeyJwk: Jwk;
}

/** `.dysd` 机密段明文(口令加密)。**不含单位签发私钥**——二三级不能再往下签发。 */
export interface DelegatedLicenseSecret {
  configTemplate: UnitConfig;
  applyKeys: DelegatedApplyKey[];
  /** 一级已创建的批次快照（active/closed），供二三级选择并导入学生文件；二三级不能自建批次。 */
  batches?: Batch[];
}

/** `.dysd` 下级授权文件。 */
export interface DelegatedLicenseFile {
  schemaVersion: typeof LICENSE_SCHEMA_VERSION;
  type: "delegated-license";
  /** 服务商签发的单位证书,逐字节内嵌(信任锚)。 */
  unitCert: UnitCertFile;
  header: DelegatedLicenseHeader;
  enc: SealedSection;
  sig: FileSignature;
}

/** 验证链输出:可信头部 + 级联封顶后的有效期。 */
export interface DelegatedVerifyResult {
  header: DelegatedLicenseHeader;
  unitCert: UnitCertFile;
  /** = min(header.expiresAt, unitCert.payload.notAfter);落进 settings.activation.expiresAt。 */
  effectiveExpiresAt: number;
}

/** 打开结果:验证链 + 口令解封后的机密段。 */
export interface DelegatedOpenResult extends DelegatedVerifyResult {
  secret: DelegatedLicenseSecret;
}

/**
 * 一级签发 .dysd(services/delegation.ts 用)。
 * 签名覆盖 `canonical(header) | enc.data | enc.hash`,用单位签发私钥(不出一级本机)。
 */
export async function issueDelegatedLicense(input: {
  delegationId: string;
  unitId: string;
  role: DelegatedRole;
  scope: LicenseScope;
  issuedAt: number;
  expiresAt: number;
  boundFingerprint: string | null;
  /** 单位签发密钥 id,必须 = unitCert.payload.signKey.keyId。 */
  signKeyId: string;
  unitCert: UnitCertFile;
  secret: DelegatedLicenseSecret;
  password: string;
  /** 单位签发私钥(RSA-PSS)。 */
  signPrivateKeyJwk: Jwk;
  /** PBKDF2 迭代次数;省略取默认(1.2M),单测可压到最低。 */
  iterations?: number;
}): Promise<DelegatedLicenseFile> {
  const header: DelegatedLicenseHeader = {
    delegationId: input.delegationId,
    unitId: input.unitId,
    role: input.role,
    scope: input.scope,
    issuedBy: input.unitId,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    boundFingerprint: input.boundFingerprint,
    signKeyId: input.signKeyId,
  };
  const enc = await sealSecret(input.secret, input.password, input.iterations);
  const sig = await signEnvelope(
    header,
    enc,
    header.signKeyId,
    input.signPrivateKeyJwk,
  );
  return {
    schemaVersion: LICENSE_SCHEMA_VERSION,
    type: "delegated-license",
    unitCert: input.unitCert,
    header,
    enc,
    sig,
  };
}

/** 断言为 .dysd。校验到"能安全读 header + 内嵌证书结构完好"为止,不做验签(那是验证链的事)。 */
export function asDelegatedLicense(raw: unknown): DelegatedLicenseFile {
  const env = raw as Partial<DelegatedLicenseFile> | null;
  if (!env || env.type !== "delegated-license") {
    throw new LicenseError("not-a-license", "不是下级授权文件(.dysd)");
  }
  const h = env.header as Partial<DelegatedLicenseHeader> | undefined;
  // 注意:此处不拒绝 role=level1——篡改 role 交由验证链步骤④(验签)拦截,以给出"已被篡改"的准确文案。
  const bad =
    !h ||
    typeof h.delegationId !== "string" ||
    typeof h.unitId !== "string" ||
    (h.role !== "level1" && h.role !== "level2" && h.role !== "level3") ||
    typeof h.expiresAt !== "number" ||
    typeof h.signKeyId !== "string" ||
    !h.scope ||
    typeof h.scope !== "object";
  if (bad) throw new LicenseError("not-a-license", "授权文件头部字段缺失");
  if (!env.enc || !env.enc.alg || typeof env.enc.data !== "string") {
    throw new LicenseError("not-a-license", "授权文件缺少机密段");
  }
  if (!env.sig || typeof env.sig.value !== "string") {
    throw new LicenseError("not-a-license", "授权文件缺少签名");
  }
  // 内嵌证书必须结构完好(验签在验证链步骤①)。
  asUnitCert(env.unitCert);
  return env as DelegatedLicenseFile;
}

/**
 * 二三级离线验证链(dual-mode/12 §3 的 ①–⑥步,不需口令)。
 * 唯一信任锚 = 编译进包的服务商公钥 `verifyKeys`。任何一步失败即抛 `LicenseError`。
 */
export async function verifyDelegatedLicense(input: {
  file: DelegatedLicenseFile;
  verifyKeys: VerifyKey[];
  machineFingerprint: string;
}): Promise<DelegatedVerifyResult> {
  const { file, verifyKeys, machineFingerprint } = input;
  const cert = file.unitCert;
  // ① 服务商公钥 → 单位证书(得到可信的单位签发公钥与 notAfter)。
  const anchor = verifyKeys.find((k) => k.keyId === cert.sig.signKeyId);
  if (!anchor) throw new LicenseError("unknown-sign-key", cert.sig.signKeyId);
  try {
    await verifyPayloadWithKey(cert.payload, cert.sig, anchor.publicKeyJwk);
  } catch {
    throw new LicenseError("cert-bad-signature");
  }
  // ② 签发密钥一致(防换钥)。
  if (file.header.signKeyId !== cert.payload.signKey.keyId) {
    throw new LicenseError("sign-key-mismatch");
  }
  // ③ 单位一致(防跨单位)。
  if (file.header.unitId !== cert.payload.unitId) {
    throw new LicenseError("unit-mismatch");
  }
  // ④ 单位签发公钥 → .dysd(防改 role/scope/expiresAt;失败即"已被篡改")。
  await verifyEnvelope(file.header, file.enc, file.sig, [
    {
      keyId: file.sig.signKeyId,
      publicKeyJwk: cert.payload.signKey.publicKeyJwk,
    },
  ]);
  // ⑤ 级联到期:下级有效期不得超出单位授权有效期。
  if (file.header.expiresAt > cert.payload.notAfter) {
    throw new LicenseError("expiry-exceeds-cert");
  }
  const scope = file.header.scope;
  if (file.header.role === "level2" && (!scope.grade || scope.class)) {
    throw new LicenseError("delegated-scope-invalid");
  }
  if (file.header.role === "level3" && (!scope.grade || !scope.class)) {
    throw new LicenseError("delegated-scope-invalid");
  }
  // ⑥ 机器码绑定。
  if (
    file.header.boundFingerprint !== null &&
    file.header.boundFingerprint !== machineFingerprint
  ) {
    throw new LicenseError("delegated-fingerprint-mismatch");
  }
  return {
    header: file.header,
    unitCert: cert,
    effectiveExpiresAt: Math.min(file.header.expiresAt, cert.payload.notAfter),
  };
}

/** 完整打开:验证链 ①–⑥ → 口令解封 ⑦。返回落库所需的一切。 */
export async function openDelegatedLicense(input: {
  file: DelegatedLicenseFile;
  verifyKeys: VerifyKey[];
  machineFingerprint: string;
  password: string;
}): Promise<DelegatedOpenResult> {
  const verified = await verifyDelegatedLicense(input);
  const secret = await openSecret<DelegatedLicenseSecret>(
    input.file.enc,
    input.password,
  );
  return { ...verified, secret };
}
