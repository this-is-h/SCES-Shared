/**
 * 三级授权链端到端单测:复刻 `dual-mode/poc/role-delegation.mjs` 的 20 条断言
 * (含 8 条攻击路径),但走真实 `shared` 模块(`delegated` / `unit-cert` / `offline-license`)。
 *
 * 与 offline-license.test.ts 一致:用 `node:fs` 读真实契约种子,让"87 KB 配置随 .dysd
 * 密封分发后原样取回"成为真实断言;PBKDF2 压到 FAST_ITER(算法路径不变,只省 KDF 时间)。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { Jwk, UnitConfig } from "../types";
import { decryptDyfFile, encryptPayload } from "../crypto/hybrid";
import { generateRsaKeyPair } from "../crypto/rsa";
import { generateSignKeyPair } from "../crypto/sign";
import type { SignKeyPair } from "../crypto/sign";
import { useWebCryptoProvider } from "../crypto/webcrypto";
import { LicenseError } from "./errors";
import type { LicenseErrorCode } from "./errors";
import {
  issueOfflineLicense,
  openOfflineLicense,
  verifyOfflineLicense,
} from "./offline-license";
import {
  issueUnitCert,
  issueUnitPubkeyPackage,
  verifyUnitCert,
  verifyUnitPubkeyPackage,
} from "./unit-cert";
import type {
  UnitCertFile,
  UnitCertPayload,
  UnitPubkeyPackage,
  UnitPubkeyPayload,
} from "./unit-cert";
import {
  asDelegatedLicense,
  issueDelegatedLicense,
  openDelegatedLicense,
  verifyDelegatedLicense,
} from "./delegated";
import type {
  DelegatedLicenseFile,
  DelegatedLicenseSecret,
  DelegatedRole,
} from "./delegated";
import type { LicenseScope, OfflineLicenseFile, VerifyKey } from "./types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = (id: string): UnitConfig =>
  JSON.parse(
    readFileSync(
      path.resolve(HERE, "../../../SCES-Server/contracts/seed", `${id}.json`),
      "utf-8",
    ),
  ) as UnitConfig;

const FAST_ITER = 1_000;
const TIMEOUT = 60_000;

const LICENSE_EXPIRES = Date.parse("2027-08-31T23:59:59+08:00");
const D3_EXPIRES = Date.parse("2026-08-31T23:59:59+08:00");
const RENEWED = Date.parse("2028-08-31T23:59:59+08:00");
const L1_FP = "K7QX-M4NP-8ZR2";
const L3_FP = "P3JD-9WQK-L5T7";
const VENDOR_KEY_ID = "vendor-2026a";
const UNIT_ID = "nxuLx";
const SIGN_KEY_ID = "nxuLx-sign-1";
const APPLY_KEY_ID = "nxuLx-k1";
const SCOPE_CLASS: LicenseScope = { grade: "2025", class: "生物科学1班" };

let vendorKp: SignKeyPair;
let unitSignKp: SignKeyPair;
let applyKp: { publicKeyJwk: Jwk; privateKeyJwk: Jwk };
let verifyKeys: VerifyKey[];
let unitConfig: UnitConfig;
let dysl: OfflineLicenseFile;
let dysk: UnitPubkeyPackage;
let cert: UnitCertFile;
let d3: DelegatedLicenseFile;

/** 从 LicenseError 拿 code,并顺带断言 instanceof。 */
async function rejectCode(
  fn: () => Promise<unknown>,
): Promise<LicenseErrorCode> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof LicenseError) return e.code;
    throw e;
  }
  throw new Error("预期抛出 LicenseError,但成功返回");
}

function certPayload(notAfter: number): UnitCertPayload {
  return {
    unitId: UNIT_ID,
    licenseId: "L-1111",
    signKey: { keyId: SIGN_KEY_ID, publicKeyJwk: unitSignKp.publicKeyJwk },
    applyKey: { keyId: APPLY_KEY_ID, publicKeyJwk: applyKp.publicKeyJwk },
    issuedAt: 1_750_000_000_000,
    notAfter,
  };
}

async function makeCert(
  notAfter: number,
  signerPriv: Jwk = vendorKp.privateKeyJwk,
): Promise<UnitCertFile> {
  return issueUnitCert({
    payload: certPayload(notAfter),
    signKeyId: VENDOR_KEY_ID,
    signPrivateKeyJwk: signerPriv,
  });
}

function delegatedSecret(): DelegatedLicenseSecret {
  return {
    configTemplate: unitConfig,
    applyKeys: [
      {
        keyId: APPLY_KEY_ID,
        current: true,
        publicKeyJwk: applyKp.publicKeyJwk,
        privateKeyJwk: applyKp.privateKeyJwk,
      },
    ],
  };
}

async function makeDelegation(opts: {
  id?: string;
  role?: DelegatedRole;
  scope?: LicenseScope;
  expiresAt: number;
  fingerprint?: string | null;
  password?: string;
  unitCert?: UnitCertFile;
  signPrivateKeyJwk?: Jwk;
  signKeyId?: string;
}): Promise<DelegatedLicenseFile> {
  return issueDelegatedLicense({
    delegationId: opts.id ?? "D-3001",
    unitId: UNIT_ID,
    role: opts.role ?? "level3",
    scope: opts.scope ?? SCOPE_CLASS,
    issuedAt: 1_750_100_000_000,
    expiresAt: opts.expiresAt,
    boundFingerprint: opts.fingerprint === undefined ? L3_FP : opts.fingerprint,
    signKeyId: opts.signKeyId ?? SIGN_KEY_ID,
    unitCert: opts.unitCert ?? cert,
    secret: delegatedSecret(),
    password: opts.password ?? "L3-PWD",
    signPrivateKeyJwk: opts.signPrivateKeyJwk ?? unitSignKp.privateKeyJwk,
    iterations: FAST_ITER,
  });
}

beforeAll(async () => {
  useWebCryptoProvider();
  vendorKp = await generateSignKeyPair();
  unitSignKp = await generateSignKeyPair();
  applyKp = await generateRsaKeyPair();
  verifyKeys = [{ keyId: VENDOR_KEY_ID, publicKeyJwk: vendorKp.publicKeyJwk }];
  unitConfig = SEED("lixing-shuyuan");

  // 交换 1:服务商签发 .dysl(不含任何单位私钥)。
  dysl = await issueOfflineLicense({
    header: {
      licenseId: "L-1111",
      unitId: UNIT_ID,
      unitName: "励行书院",
      unitType: "college",
      role: "level1",
      scope: {},
      issuedAt: 1_750_000_000_000,
      expiresAt: LICENSE_EXPIRES,
      boundFingerprint: L1_FP,
      maxDelegations: 64,
      profileHint: "offline-2026s1",
    },
    secret: {
      unit: { unitId: UNIT_ID, name: "励行书院", unitType: "college" },
      configTemplate: unitConfig,
      features: { maxDelegations: 64 },
    },
    password: "L1-PWD",
    signKeyId: VENDOR_KEY_ID,
    signPrivateKeyJwk: vendorKp.privateKeyJwk,
    iterations: FAST_ITER,
  });

  // 交换 2:一级自签 .dysk → 服务商回签 .dysc(notAfter = .dysl 到期日)。
  const dyskPayload: UnitPubkeyPayload = {
    licenseId: "L-1111",
    unitId: UNIT_ID,
    boundFingerprint: L1_FP,
    signKey: { keyId: SIGN_KEY_ID, publicKeyJwk: unitSignKp.publicKeyJwk },
    applyKey: { keyId: APPLY_KEY_ID, publicKeyJwk: applyKp.publicKeyJwk },
    issuedAt: 1_750_050_000_000,
  };
  dysk = await issueUnitPubkeyPackage({
    payload: dyskPayload,
    signPrivateKeyJwk: unitSignKp.privateKeyJwk,
  });
  cert = await makeCert(LICENSE_EXPIRES);
  d3 = await makeDelegation({ expiresAt: D3_EXPIRES, fingerprint: L3_FP });
}, TIMEOUT);

describe("密钥归属与两次交换(.dysl / .dysk / .dysc)", () => {
  it("① .dysl 明文与密文段均不含 privateKeyJwk(服务商无法解密学生数据)", async () => {
    expect(JSON.stringify(dysl)).not.toContain("privateKeyJwk");
    const opened = await openOfflineLicense({
      file: dysl,
      password: "L1-PWD",
      verifyKeys,
      fingerprint: L1_FP,
    });
    expect(JSON.stringify(opened)).not.toContain("privateKeyJwk");
  });

  it("② 一级 .dysl 验签通过", async () => {
    await expect(
      verifyOfflineLicense(dysl, verifyKeys),
    ).resolves.toBeUndefined();
  });

  it("③ 一级本地生成单位签发密钥 + 单位申请密钥(两套独立)", () => {
    expect(unitSignKp.publicKeyJwk).toBeTruthy();
    expect(applyKp.privateKeyJwk).toBeTruthy();
    expect(JSON.stringify(unitSignKp.publicKeyJwk)).not.toBe(
      JSON.stringify(applyKp.publicKeyJwk),
    );
  });

  it("④ .dysk 自签有效(证明一级持有签发私钥)", async () => {
    await expect(verifyUnitPubkeyPackage(dysk)).resolves.toBeUndefined();
  });

  it("⑤ .dysk 与签发台账匹配(licenseId + unitId + 机器码)", () => {
    expect(dysk.payload.licenseId).toBe("L-1111");
    expect(dysk.payload.unitId).toBe(UNIT_ID);
    expect(dysk.payload.boundFingerprint).toBe(L1_FP);
  });

  it("⑥ .dysk 被替换申请公钥后自签失效(防中间人换钥)", async () => {
    const tampered = structuredClone(dysk);
    const other = await generateRsaKeyPair();
    tampered.payload.applyKey.publicKeyJwk = other.publicKeyJwk;
    expect(await rejectCode(() => verifyUnitPubkeyPackage(tampered))).toBe(
      "bad-signature",
    );
  });

  it("⑦ .dysc 单位证书验签通过(notAfter = 一级授权到期日)", async () => {
    await expect(verifyUnitCert(cert, verifyKeys)).resolves.toBeUndefined();
    expect(cert.payload.notAfter).toBe(LICENSE_EXPIRES);
  });
});

describe("下级导入与解密(.dysd)", () => {
  it("⑧ 三级导入 .dysd 即生效(角色/范围/配置/申请私钥齐全)", async () => {
    const opened = await openDelegatedLicense({
      file: d3,
      verifyKeys,
      machineFingerprint: L3_FP,
      password: "L3-PWD",
    });
    expect(opened.header.role).toBe("level3");
    expect(opened.header.scope.class).toBe("生物科学1班");
    expect(opened.secret.configTemplate.id).toBe("lixing-shuyuan");
    expect(typeof opened.secret.applyKeys[0]?.privateKeyJwk.d).toBe("string");
  });

  it("⑨ 三级生效有效期 = min(下级到期, 单位授权到期)", async () => {
    const opened = await openDelegatedLicense({
      file: d3,
      verifyKeys,
      machineFingerprint: L3_FP,
      password: "L3-PWD",
    });
    expect(opened.effectiveExpiresAt).toBe(D3_EXPIRES);
  });

  it("⑩ 三级可解密学生 .dyf(小程序公钥 ↔ 委派下发的私钥闭合)", async () => {
    const opened = await openDelegatedLicense({
      file: d3,
      verifyKeys,
      machineFingerprint: L3_FP,
      password: "L3-PWD",
    });
    // 学生端用编译进小程序的申请公钥加密(= dysk.payload.applyKey.publicKeyJwk)。
    const dyf = await encryptPayload({
      payload: {
        applyId: "A-1",
        revision: 1,
        batchId: "B-1",
        personal: { studentId: "12025010101", name: "张三" },
        dyf: { 313: { score: 6 } },
      },
      publicKeyJwk: dysk.payload.applyKey.publicKeyJwk,
      type: "apply",
    });
    const applyKey = opened.secret.applyKeys[0];
    if (!applyKey) throw new Error("缺少下发的申请密钥");
    const dec = await decryptDyfFile({
      file: dyf,
      privateKeyJwk: applyKey.privateKeyJwk,
    });
    expect(
      (dec.payload as { personal: { studentId: string } }).personal.studentId,
    ).toBe("12025010101");
  });
});

describe("攻击与异常路径(8 条)", () => {
  it("三级授权缺少年级范围被拒", async () => {
    const f = await makeDelegation({
      id: "D-MISSING-GRADE",
      role: "level3",
      scope: { class: "生物科学1班" },
      expiresAt: D3_EXPIRES,
    });
    expect(
      await rejectCode(() =>
        verifyDelegatedLicense({
          file: f,
          verifyKeys,
          machineFingerprint: L3_FP,
        }),
      ),
    ).toBe("delegated-scope-invalid");
  });

  it("⑪ 伪造单位证书(自签 cert)被拒", async () => {
    const rogue = await generateSignKeyPair();
    const rogueCert = await makeCert(4_000_000_000_000, rogue.privateKeyJwk);
    const f = await makeDelegation({
      id: "D-X",
      role: "level3",
      scope: {},
      expiresAt: 3_900_000_000_000,
      password: "p",
      unitCert: rogueCert,
    });
    expect(
      await rejectCode(() =>
        verifyDelegatedLicense({
          file: f,
          verifyKeys,
          machineFingerprint: L3_FP,
        }),
      ),
    ).toBe("cert-bad-signature");
  });

  it("⑫ 一级签出超出单位授权有效期的下级授权被拒(级联到期强制)", async () => {
    const f = await makeDelegation({
      id: "D-3002",
      role: "level3",
      scope: {},
      expiresAt: LICENSE_EXPIRES + 86_400_000,
      password: "p",
    });
    expect(
      await rejectCode(() =>
        verifyDelegatedLicense({
          file: f,
          verifyKeys,
          machineFingerprint: L3_FP,
        }),
      ),
    ).toBe("expiry-exceeds-cert");
  });

  it("⑬ 他人签发密钥签的 .dysd 被拒(cert 里的公钥验不过)", async () => {
    const rogue = await generateSignKeyPair();
    const f = await makeDelegation({
      id: "D-3003",
      role: "level3",
      scope: {},
      expiresAt: D3_EXPIRES,
      password: "p",
      signPrivateKeyJwk: rogue.privateKeyJwk,
    });
    expect(
      await rejectCode(() =>
        verifyDelegatedLicense({
          file: f,
          verifyKeys,
          machineFingerprint: L3_FP,
        }),
      ),
    ).toBe("bad-signature");
  });

  it("⑭ 篡改 .dysd 的 role(三级提权为一级)被拒", async () => {
    const t = structuredClone(d3);
    t.header.role = "level1";
    expect(
      await rejectCode(() =>
        verifyDelegatedLicense({
          file: t,
          verifyKeys,
          machineFingerprint: L3_FP,
        }),
      ),
    ).toBe("bad-signature");
  });

  it("⑮ 篡改 .dysd 的 scope(越权到全年级)被拒", async () => {
    const t = structuredClone(d3);
    t.header.scope = { grade: "2025" };
    expect(
      await rejectCode(() =>
        verifyDelegatedLicense({
          file: t,
          verifyKeys,
          machineFingerprint: L3_FP,
        }),
      ),
    ).toBe("bad-signature");
  });

  it("⑯ .dysd 拿到别的设备上用被拒(机器码绑定)", async () => {
    expect(
      await rejectCode(() =>
        verifyDelegatedLicense({
          file: d3,
          verifyKeys,
          machineFingerprint: "ZZZZ-ZZZZ-ZZZZ",
        }),
      ),
    ).toBe("delegated-fingerprint-mismatch");
  });

  it("⑰ 换 signKeyId 但 cert 未换被拒", async () => {
    const t = structuredClone(d3);
    t.header.signKeyId = "nxuLx-sign-2";
    expect(
      await rejectCode(() =>
        verifyDelegatedLicense({
          file: t,
          verifyKeys,
          machineFingerprint: L3_FP,
        }),
      ),
    ).toBe("sign-key-mismatch");
  });

  it("⑱ 跨单位使用(cert 是 A 单位、header 是 B 单位)被拒", async () => {
    const t = structuredClone(d3);
    t.header.unitId = "testTest1";
    expect(
      await rejectCode(() =>
        verifyDelegatedLicense({
          file: t,
          verifyKeys,
          machineFingerprint: L3_FP,
        }),
      ),
    ).toBe("unit-mismatch");
  });
});

describe("续期 → 级联重签", () => {
  it("⑲ 续期后一级可重签下级,新有效期生效(同 keyId,历史 .dyf 仍可解)", async () => {
    const cert2 = await makeCert(RENEWED);
    const d3renewed = await makeDelegation({
      expiresAt: Date.parse("2027-08-31T23:59:59+08:00"),
      fingerprint: L3_FP,
      unitCert: cert2,
    });
    const r = await openDelegatedLicense({
      file: d3renewed,
      verifyKeys,
      machineFingerprint: L3_FP,
      password: "L3-PWD",
    });
    expect(r.effectiveExpiresAt).toBe(Date.parse("2027-08-31T23:59:59+08:00"));
    expect(r.secret.applyKeys[0]?.keyId).toBe(APPLY_KEY_ID);
  });

  it("⑳ 旧 .dysd 仍受旧 cert 的 notAfter 约束(不会因续期自动延长)", async () => {
    const r = await verifyDelegatedLicense({
      file: d3,
      verifyKeys,
      machineFingerprint: L3_FP,
    });
    expect(r.effectiveExpiresAt).toBeLessThanOrEqual(LICENSE_EXPIRES);
  });
});

describe("结构断言(asDelegatedLicense)", () => {
  it("拒绝 type 不符", () => {
    expect(() => asDelegatedLicense({ type: "offline-license" })).toThrow(
      LicenseError,
    );
  });

  it("拒绝缺少内嵌单位证书", () => {
    const t = structuredClone(d3) as unknown as Record<string, unknown>;
    delete t.unitCert;
    expect(() => asDelegatedLicense(t)).toThrow(LicenseError);
  });

  it("接受结构完好的 .dysd(供验证链继续)", () => {
    expect(asDelegatedLicense(structuredClone(d3)).header.delegationId).toBe(
      "D-3001",
    );
  });
});
