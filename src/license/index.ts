/**
 * 授权文件模块（Node 侧专用）。
 *
 * 不从 `shared/src/index.ts` 导出、不镜像进小程序：
 * 依赖 Node WebCrypto 的 PBKDF2 与 RSA-PSS，且小程序不需要授权文件能力。
 * 消费方走子路径 `@dms/shared/license` 或相对路径 `shared/src/license/index.ts`。
 */
export type {
    DysFileEnvelope,
    DysFileType,
    FileSignature,
    LicenseRole,
    LicenseScope,
    OfflineLicenseFile,
    OfflineLicenseHeader,
    OfflineLicenseSecret,
    RebindRequestFile,
    SealAlg,
    SealedSection,
    UnitRef,
    VerifyKey,
} from './types'
export { LICENSE_SCHEMA_VERSION } from './types'

export type { LicenseErrorCode } from './errors'
export { LICENSE_ERROR_MESSAGES, LicenseError } from './errors'

export { PBKDF2_ITERATIONS, openSecret, sealSecret } from './seal'
export { envelopeSignedBytes, signEnvelope, verifyEnvelope } from './envelope'
export {
    asOfflineLicense,
    issueOfflineLicense,
    openOfflineLicense,
    parseDysFile,
    verifyOfflineLicense,
} from './offline-license'
export type {
    KeyRef,
    UnitCertFile,
    UnitCertPayload,
    UnitPubkeyPackage,
    UnitPubkeyPayload,
} from './unit-cert'
export {
    asUnitCert,
    asUnitPubkeyPackage,
    issueUnitCert,
    issueUnitPubkeyPackage,
    signPayload,
    verifyPayloadWithKey,
    verifyPayloadWithKeys,
    verifyUnitCert,
    verifyUnitPubkeyPackage,
} from './unit-cert'
export type {
    DelegatedApplyKey,
    DelegatedLicenseFile,
    DelegatedLicenseHeader,
    DelegatedLicenseSecret,
    DelegatedOpenResult,
    DelegatedRole,
    DelegatedVerifyResult,
} from './delegated'
export {
    asDelegatedLicense,
    issueDelegatedLicense,
    openDelegatedLicense,
    verifyDelegatedLicense,
} from './delegated'
export { decideClockGuard } from './clock-guard'
