/**
 * 授权文件类型定义（`.dysl` 单位授权 / `.dysr` 换机申请）。
 *
 * 家族里的另外三种文件（`.dysk` 公钥包 / `.dysc` 单位证书 / `.dysd` 下级授权）
 * 属于 M-O1B 的三级授权链，见 `dual-mode/12-role-delegation.md`；
 * 它们复用本文件的 `SealedSection` / `FileSignature` / `VerifyKey`。
 */
import type { Jwk, UnitConfig } from '../types'

/** 授权文件 schema 版本。结构不兼容变更时 +1，旧版本一律拒绝而不是猜。 */
export const LICENSE_SCHEMA_VERSION = 1

/** 角色。`.dysl` 恒为 level1；level2/level3 由一级用 `.dysd` 签发。 */
export type LicenseRole = 'level1' | 'level2' | 'level3'

/** 数据范围。level1 恒为空对象；level2 限年级，level3 限班级。 */
export interface LicenseScope {
    grade?: string
    class?: string
}

/** 验签公钥。编译进管理端安装包（`__DMS_LICENSE_VERIFY_KEYS__`），可多把以支持轮换。 */
export interface VerifyKey {
    keyId: string
    publicKeyJwk: Jwk
}

/** 口令加密段的算法参数。写进文件，便于将来调参而不破坏旧文件。 */
export interface SealAlg {
    kdf: 'PBKDF2-SHA256'
    iterations: number
    aes: 'AES-256-GCM'
}

/** 口令加密段。`hash` 是明文的 sha256，在 GCM 之外再校验一次（与 `.dyf` 的做法一致）。 */
export interface SealedSection {
    alg: SealAlg
    /** base64，16 字节 */
    salt: string
    /** base64，12 字节 */
    iv: string
    /** base64 密文 */
    data: string
    /** hex sha256(明文 JSON) */
    hash: string
}

/** 文件签名。覆盖 `canonical(header) | enc.data | enc.hash` 三段。 */
export interface FileSignature {
    alg: 'RSA-PSS-SHA256'
    saltLength: number
    /** 用哪把公钥验签 */
    signKeyId: string
    /** base64，256 字节 */
    value: string
}

/** 单位标识（与 `UnitConfig.unit` 同构，独立定义以免授权文件被配置结构变更牵连）。 */
export interface UnitRef {
    unitId: string
    name: string
    unitType: string
    parentUnit?: { unitId: string; name: string }
}

/**
 * `.dysl` 明文头。**验签前即可展示给用户**——
 * 这样"文件发错了"能在输口令之前就发现。
 */
export interface OfflineLicenseHeader {
    /** UUID v4，续期/换机沿用同一个，是服务商台账的主键 */
    licenseId: string
    unitId: string
    unitName: string
    unitType: string
    role: 'level1'
    scope: LicenseScope
    issuedAt: number
    expiresAt: number
    /** null = 浮动授权（不绑机器） */
    boundFingerprint: string | null
    /** 允许签发的下级授权份数上限 */
    maxDelegations: number
    signKeyId: string
    /** 仅提示：预期配套的发布档 profileId */
    profileHint: string
}

/** `.dysl` 机密段明文。**不含任何私钥**（决策 #41 修订）。 */
export interface OfflineLicenseSecret {
    unit: UnitRef
    /** 完整 UnitConfig，逐字节取自 `SCES-Server/contracts/seed/<configId>.json` */
    configTemplate: UnitConfig
    features: { maxDelegations: number }
}

/** `.dysl` 单位授权文件。 */
export interface OfflineLicenseFile {
    schemaVersion: typeof LICENSE_SCHEMA_VERSION
    type: 'offline-license'
    header: OfflineLicenseHeader
    enc: SealedSection
    sig: FileSignature
}

/**
 * `.dysr` 换机申请文件。
 * **不签名**——它不承载任何权限，只是把新机器码送到服务商手里的载体，
 * 明文便于人工核对。
 */
export interface RebindRequestFile {
    schemaVersion: typeof LICENSE_SCHEMA_VERSION
    type: 'rebind-request'
    licenseId: string
    unitId: string
    oldFingerprint: string | null
    newFingerprint: string
    requestedAt: number
    reason: string
    appVersion: string
    profileId: string
}

/** `dys*` 文件族的 `type` 取值。解析入口按它分派。 */
export type DysFileType =
    | 'offline-license'
    | 'rebind-request'
    | 'unit-pubkey'
    | 'unit-cert'
    | 'delegated-license'

/** 任意 `dys*` 文件的公共头部，`parseDysFile` 的返回形状。 */
export interface DysFileEnvelope {
    schemaVersion: number
    type: string
    [key: string]: unknown
}
