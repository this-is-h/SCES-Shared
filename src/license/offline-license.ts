/**
 * `.dysl` 单位授权文件：签发（服务商侧）与解析/验签/解封（管理端侧）。
 *
 * 流程与错误分支见 `dual-mode/03-offline-license.md` §4 的流程图。
 * 顺序是刻意的：**解析 → 验签 → 校机器码 → 才要口令**。
 * 让用户在输口令之前就能发现"文件发错了 / 绑到别的机器了"。
 */
import type { Jwk } from "../types";
import { nz } from "../nullish";
import { LicenseError } from "./errors";
import { signEnvelope, verifyEnvelope } from "./envelope";
import { PBKDF2_ITERATIONS, openSecret, sealSecret } from "./seal";
import { LICENSE_SCHEMA_VERSION } from "./types";
import type {
  DysFileEnvelope,
  OfflineLicenseFile,
  OfflineLicenseHeader,
  OfflineLicenseSecret,
  VerifyKey,
} from "./types";

/**
 * 解析任意 `dys*` 文件文本，只保证公共头部存在且版本可支持。
 * 具体类型的形状校验由各自的 `asXxx` 断言函数负责。
 */
export function parseDysFile(text: string): DysFileEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new LicenseError("not-a-license", "文件不是有效的 JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new LicenseError("not-a-license");
  }
  const env = raw as Record<string, unknown>;
  if (typeof env["type"] !== "string") {
    throw new LicenseError("not-a-license");
  }
  if (typeof env["schemaVersion"] !== "number") {
    throw new LicenseError("not-a-license");
  }
  if (env["schemaVersion"] > LICENSE_SCHEMA_VERSION) {
    throw new LicenseError(
      "unsupported-version",
      `文件版本 ${env["schemaVersion"]}`,
    );
  }
  return env as DysFileEnvelope;
}

/** 断言为 `.dysl`。校验到"能安全读 header"为止，不做业务校验。 */
export function asOfflineLicense(raw: unknown): OfflineLicenseFile {
  const env = raw as Partial<OfflineLicenseFile> | null;
  if (!env || env.type !== "offline-license") {
    throw new LicenseError("not-a-license", "不是单位授权文件（.dysl）");
  }
  const h = env.header as Partial<OfflineLicenseHeader> | undefined;
  const missing =
    !h ||
    typeof h.licenseId !== "string" ||
    typeof h.unitId !== "string" ||
    typeof h.unitName !== "string" ||
    typeof h.expiresAt !== "number" ||
    typeof h.signKeyId !== "string" ||
    h.role !== "level1";
  if (missing) {
    throw new LicenseError("not-a-license", "授权文件头部字段缺失");
  }
  if (!env.enc || !env.enc.alg || typeof env.enc.data !== "string") {
    throw new LicenseError("not-a-license", "授权文件缺少机密段");
  }
  if (!env.sig || typeof env.sig.value !== "string") {
    throw new LicenseError("not-a-license", "授权文件缺少签名");
  }
  return env as OfflineLicenseFile;
}

/** 签发 `.dysl`（服务商侧，`tools/license-kit`）。 */
export async function issueOfflineLicense(input: {
  header: Omit<OfflineLicenseHeader, "signKeyId">;
  secret: OfflineLicenseSecret;
  password: string;
  signKeyId: string;
  signPrivateKeyJwk: Jwk;
  iterations?: number;
}): Promise<OfflineLicenseFile> {
  const header: OfflineLicenseHeader = {
    ...input.header,
    signKeyId: input.signKeyId,
  };
  const enc = await sealSecret(
    input.secret,
    input.password,
    nz(input.iterations, PBKDF2_ITERATIONS),
  );
  const sig = await signEnvelope(
    header,
    enc,
    input.signKeyId,
    input.signPrivateKeyJwk,
  );
  return {
    schemaVersion: LICENSE_SCHEMA_VERSION,
    type: "offline-license",
    header,
    enc,
    sig,
  };
}

/** 只验签，不解封（`license-kit inspect` 与激活页第一步都用它——不需要口令）。 */
export async function verifyOfflineLicense(
  file: OfflineLicenseFile,
  verifyKeys: VerifyKey[],
): Promise<void> {
  await verifyEnvelope(file.header, file.enc, file.sig, verifyKeys);
}

/**
 * 完整打开：验签 → 校机器码 → 口令解封。
 *
 * `fingerprint` 传 `undefined` 表示"本次不校验机器码"（服务商侧检视、单测）；
 * 传字符串则必须与 `header.boundFingerprint` 相等。
 * `header.boundFingerprint === null` 是浮动授权，任何机器都放行。
 *
 * **有意不在这里判过期**：过期后仍必须能打开文件、读出配置，
 * 否则用户连"只读查看历史数据"都做不到。过期判定归 `services/license.ts`。
 */
export async function openOfflineLicense(input: {
  file: OfflineLicenseFile;
  password: string;
  verifyKeys: VerifyKey[];
  fingerprint?: string | null;
}): Promise<OfflineLicenseSecret> {
  await verifyOfflineLicense(input.file, input.verifyKeys);
  const bound = input.file.header.boundFingerprint;
  if (
    bound !== null &&
    typeof input.fingerprint === "string" &&
    bound !== input.fingerprint
  ) {
    throw new LicenseError(
      "fingerprint-mismatch",
      `本机机器码 ${input.fingerprint}`,
    );
  }
  return openSecret<OfflineLicenseSecret>(input.file.enc, input.password);
}
