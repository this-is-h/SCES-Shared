/**
 * 单位公钥包（`.dysk`）与单位证书（`.dysc`）。
 *
 * 二者都是**纯公开信息、不加密、不含私钥**，只签名（覆盖 `canonical(payload)`）：
 * - `.dysk`：一级导出，**单位签发私钥自签**（证明持有签发私钥）。含申请公钥 + 签发公钥。
 * - `.dysc`：服务商回签（`__DMS_LICENSE_VERIFY_KEYS__` 验），为该单位签发公钥背书，
 *   `notAfter` = 单位授权到期日（级联失效开关）。
 *
 * 设计与信任链见 dual-mode/12-role-delegation.md §0/§2。`.dysd`（下级授权）留 M-O1B。
 */
import type { Jwk } from '../types'
import { utf8ToBytes } from '../crypto/encoding'
import { RSA_PSS_ALG, RSA_PSS_SALT_LENGTH, canonical, signBytes, verifyBytes } from '../crypto/sign'
import { LicenseError } from './errors'
import { LICENSE_SCHEMA_VERSION } from './types'
import type { FileSignature, VerifyKey } from './types'

/** 一把具名公钥（签发公钥 / 申请公钥）。 */
export interface KeyRef {
  keyId: string
  publicKeyJwk: Jwk
}

/** 被签名的字节：`canonical(payload)`（键排序，跨端可复现）。 */
function payloadBytes(payload: unknown): Uint8Array {
  return utf8ToBytes(canonical(payload))
}

/** 用签名私钥为纯 payload 签名（`.dysk` 自签、`.dysc` 服务商签共用）。 */
export async function signPayload(
  payload: unknown,
  signKeyId: string,
  signPrivateKeyJwk: Jwk,
): Promise<FileSignature> {
  const value = await signBytes(signPrivateKeyJwk, payloadBytes(payload))
  return { alg: RSA_PSS_ALG, saltLength: RSA_PSS_SALT_LENGTH, signKeyId, value }
}

/** 用一把指定公钥验 payload 签名（自签场景：公钥就在 payload 里）。失败即抛。 */
export async function verifyPayloadWithKey(
  payload: unknown,
  sig: FileSignature,
  publicKeyJwk: Jwk,
): Promise<void> {
  if (sig.alg !== RSA_PSS_ALG) {
    throw new LicenseError('bad-signature', `不支持的签名算法 ${String(sig.alg)}`)
  }
  const ok = await verifyBytes(publicKeyJwk, payloadBytes(payload), sig.value)
  if (!ok) throw new LicenseError('bad-signature')
}

/** 用 verifyKeys[]（按 signKeyId 匹配）验 payload 签名（服务商背书场景）。失败即抛。 */
export async function verifyPayloadWithKeys(
  payload: unknown,
  sig: FileSignature,
  verifyKeys: VerifyKey[],
): Promise<void> {
  if (sig.alg !== RSA_PSS_ALG) {
    throw new LicenseError('bad-signature', `不支持的签名算法 ${String(sig.alg)}`)
  }
  const key = verifyKeys.find((k) => k.keyId === sig.signKeyId)
  if (!key) throw new LicenseError('unknown-sign-key', sig.signKeyId)
  const ok = await verifyBytes(key.publicKeyJwk, payloadBytes(payload), sig.value)
  if (!ok) throw new LicenseError('bad-signature')
}

// ─────────────────────── .dysk 单位公钥包 ───────────────────────

/** `.dysk` payload（全公开）。 */
export interface UnitPubkeyPayload {
  licenseId: string
  unitId: string
  /** 绑定的机器码（便于服务商核对台账）；null = 浮动。 */
  boundFingerprint: string | null
  /** 单位签发公钥（要背书的对象）。 */
  signKey: KeyRef
  /** 单位申请公钥（顺带认证，编进小程序）。 */
  applyKey: KeyRef
  issuedAt: number
}

/** `.dysk` 单位公钥包（单位签发私钥自签）。 */
export interface UnitPubkeyPackage {
  schemaVersion: typeof LICENSE_SCHEMA_VERSION
  type: 'unit-pubkey'
  payload: UnitPubkeyPayload
  sig: FileSignature
}

/** 构造并自签 `.dysk`（一级管理端 publishUnitPublicKey 用）。 */
export async function issueUnitPubkeyPackage(input: {
  payload: UnitPubkeyPayload
  /** 单位签发私钥（RSA-PSS）。 */
  signPrivateKeyJwk: Jwk
}): Promise<UnitPubkeyPackage> {
  const sig = await signPayload(input.payload, input.payload.signKey.keyId, input.signPrivateKeyJwk)
  return { schemaVersion: LICENSE_SCHEMA_VERSION, type: 'unit-pubkey', payload: input.payload, sig }
}

/** 断言为 `.dysk`。 */
export function asUnitPubkeyPackage(raw: unknown): UnitPubkeyPackage {
  const env = raw as Partial<UnitPubkeyPackage> | null
  if (!env || env.type !== 'unit-pubkey') {
    throw new LicenseError('not-a-license', '不是单位公钥包（.dysk）')
  }
  const p = env.payload as Partial<UnitPubkeyPayload> | undefined
  const bad =
    !p ||
    typeof p.unitId !== 'string' ||
    typeof p.licenseId !== 'string' ||
    !p.signKey ||
    typeof p.signKey.keyId !== 'string' ||
    !p.signKey.publicKeyJwk ||
    !p.applyKey ||
    typeof p.applyKey.keyId !== 'string' ||
    !p.applyKey.publicKeyJwk
  if (bad) throw new LicenseError('not-a-license', '公钥包字段缺失')
  if (!env.sig || typeof env.sig.value !== 'string') {
    throw new LicenseError('not-a-license', '公钥包缺少签名')
  }
  return env as UnitPubkeyPackage
}

/** 验 `.dysk` 自签：sig.signKeyId 必须 = signKey.keyId，且用该公钥验过。 */
export async function verifyUnitPubkeyPackage(pkg: UnitPubkeyPackage): Promise<void> {
  if (pkg.sig.signKeyId !== pkg.payload.signKey.keyId) {
    throw new LicenseError('bad-signature', '公钥包签名密钥与内含签发公钥不一致')
  }
  await verifyPayloadWithKey(pkg.payload, pkg.sig, pkg.payload.signKey.publicKeyJwk)
}

// ─────────────────────── .dysc 单位证书 ───────────────────────

/** `.dysc` payload（全公开）。 */
export interface UnitCertPayload {
  unitId: string
  licenseId: string
  signKey: KeyRef
  applyKey: KeyRef
  issuedAt: number
  /** 级联失效开关：= 单位授权 .dysl 的 expiresAt。 */
  notAfter: number
}

/** `.dysc` 单位证书（服务商签名密钥签发）。 */
export interface UnitCertFile {
  schemaVersion: typeof LICENSE_SCHEMA_VERSION
  type: 'unit-cert'
  payload: UnitCertPayload
  sig: FileSignature
}

/** 服务商签发 `.dysc`（license-kit cert:issue 用）。 */
export async function issueUnitCert(input: {
  payload: UnitCertPayload
  /** 服务商签名密钥 id。 */
  signKeyId: string
  /** 服务商签名私钥（RSA-PSS）。 */
  signPrivateKeyJwk: Jwk
}): Promise<UnitCertFile> {
  const sig = await signPayload(input.payload, input.signKeyId, input.signPrivateKeyJwk)
  return { schemaVersion: LICENSE_SCHEMA_VERSION, type: 'unit-cert', payload: input.payload, sig }
}

/** 断言为 `.dysc`。 */
export function asUnitCert(raw: unknown): UnitCertFile {
  const env = raw as Partial<UnitCertFile> | null
  if (!env || env.type !== 'unit-cert') {
    throw new LicenseError('not-a-license', '不是单位证书（.dysc）')
  }
  const p = env.payload as Partial<UnitCertPayload> | undefined
  const bad =
    !p ||
    typeof p.unitId !== 'string' ||
    typeof p.licenseId !== 'string' ||
    typeof p.notAfter !== 'number' ||
    !p.signKey ||
    typeof p.signKey.keyId !== 'string' ||
    !p.signKey.publicKeyJwk ||
    !p.applyKey ||
    typeof p.applyKey.keyId !== 'string' ||
    !p.applyKey.publicKeyJwk
  if (bad) throw new LicenseError('not-a-license', '单位证书字段缺失')
  if (!env.sig || typeof env.sig.value !== 'string') {
    throw new LicenseError('not-a-license', '单位证书缺少签名')
  }
  return env as UnitCertFile
}

/** 验 `.dysc`（服务商公钥背书）。 */
export async function verifyUnitCert(cert: UnitCertFile, verifyKeys: VerifyKey[]): Promise<void> {
  await verifyPayloadWithKeys(cert.payload, cert.sig, verifyKeys)
}
