# @dys/shared — API 参考

> 三端共享层完整 API 文档。覆盖 `types` / `crypto` / `calc` / `state` / `validate` 五个模块。
> 快速上手见 `README.md`；设计背景见 `docs/ARCHITECTURE.md`（根目录）。

---

## 目录

1. [快速开始](#1-快速开始)
2. [types — 数据模型](#2-types--数据模型)
3. [crypto — 加密与哈希](#3-crypto--加密与哈希)
4. [calc — 计算引擎](#4-calc--计算引擎)
5. [state — 状态机](#5-state--状态机)
6. [validate — 校验规则](#6-validate--校验规则)
7. [平台适配](#7-平台适配)
8. [测试与构建](#8-测试与构建)

---

## 1. 快速开始

### 1.1 安装与导入

```ts
import {
    useWebCryptoProvider,
    generateRsaKeyPair,
    encryptPayload,
    decryptDyfFile,
    calcDyfTotal,
    checkImport,
} from '@dys/shared'
```

### 1.2 初始化（必须）

shared 不直接调用平台加密 API，**使用前必须先注册 `CryptoProvider`**：

```ts
// 浏览器 / Node 18+（Electron 主进程）：一行注册默认 WebCrypto 实现
useWebCryptoProvider()
```

未注册时调用任何加密函数都会抛错：`CryptoProvider 未初始化`。

### 1.3 最小示例：学生端加密申请文件

```ts
useWebCryptoProvider()

// 一级管理端创建批次时生成密钥对，公钥下发学生端，私钥留在管理端
const { publicKeyJwk, privateKeyJwk } = await generateRsaKeyPair()

// 学生端：加密申请 payload 生成 .dyf 文件
const file = await encryptPayload({
    payload: {
        applyId: 'apply-001',
        revision: 1,
        batchId: 'batch-001',
        personal: { name: '张三', studentId: '20230001' },
        dyf: { '8882': { score: 2 } },
    },
    publicKeyJwk,
    type: 'apply',
    applyId: 'apply-001',
    revision: 1,
    batchId: 'batch-001',
})

// 管理端：解密并校验完整性（hash 不匹配会抛错）
const { payload, hash } = await decryptDyfFile({ file, privateKeyJwk })
```

---

## 2. types — 数据类型

纯类型定义，无运行时逻辑。所有类型从 `@dys/shared` 顶层导出。

### 2.1 通用类型（`types/common.ts`）

| 类型 | 说明 |
|------|------|
| `Jwk` | JSON Web Key（RSA 公钥/私钥），字段与 Web Crypto 对齐，独立定义以保持无平台依赖 |
| `RsaAlgorithm` | `{ name: 'RSA-OAEP', hash: 'SHA-256' \| 'SHA-384' \| 'SHA-512' }` |
| `AesAlgorithm` | `{ name: 'AES-GCM', length: 128 \| 192 \| 256 }` |
| `EpochMs` | 时间戳（epoch 毫秒，`number`） |
| `ValidationResult` | `{ ok: boolean; errors: string[] }`，校验函数统一返回结构 |

### 2.2 批次（`types/batch.ts`）

```ts
type BatchStatus = 'draft' | 'active' | 'closed'
type CalcMode = 'weighted' | 'formula'          // formula 预留
type RankScope = 'class' | 'major' | 'grade' | 'school' | 'all'

interface CalcConfig {
    dyfWeight: number      // 德育分权重
    courseWeight: number   // 课程成绩权重
    formula?: string       // formula 模式预留
}

interface Batch {
    batchId: string
    year: number
    semester: 1 | 2
    status: BatchStatus
    applyStartAt?: EpochMs
    applyEndAt?: EpochMs
    configTemplateId?: string
    calcMode: CalcMode
    calcConfig: CalcConfig
    rankScope: RankScope | RankScope[]
    publicKeyJwk: Jwk
    privateKeyJwk?: Jwk   // 仅管理端本地，随授权文件分发
    createdAt: EpochMs
    updatedAt: EpochMs
}
```

### 2.3 单位配置（`types/unit-config.ts`）

手写 TS 映射，逐字段对齐 `server/contracts/unit-config.schema.json`（配置结构**唯一权威**，决策 #38）。防漂移由 `unit-config.test.ts`（编译期 satisfies + 运行期读契约种子抽样）把关。

```ts
type UnitConfigStatus = 'draft' | 'published' | 'archived'

interface StudentField {
    code: string          // camelCase，与 Student 字段对应（name / studentId / phone ...）
    label: string
    required: boolean
    type: 'text' | 'number'
    pattern?: string      // 校验正则
    message?: string      // 校验失败提示
    fromClass?: boolean   // 由班级级联自动填充、学生端不可编辑
}

// 计分方式（判别字段 type）；分值上限在 scoreType，不再是 support
type ScoreType =
    | { type: 'stepper'; min: number; max?: number; step: number; decimals?: number }
    | { type: 'radio'; options: Array<{ value: number; label: string }> }
    | { type: 'input'; min?: number; max?: number; decimals?: number }

// 证明材料要求（判别字段 need）；注意：这是旧 DyfItem.support「分值」语义翻转后的新含义
type Support = { need: false } | { need: true; message: string }

interface DyfItem {
    code: string
    description: string
    scoreType: ScoreType
    support: Support
    studentApplicable: boolean   // 学生端可申请
    studentRequired: boolean
    adminEditable: boolean
    adminRequired: boolean
    allowAdd: boolean            // 是否允许多次累加
    negative: boolean            // 单项取负计入总分（决策 #36）
}
// DyfGroup { code, name, items: DyfItem[] }
// DyfCategory { code, name, studentRequired, adminRequired, penalty, groups: DyfGroup[] }
// DyfConfig { categories: DyfCategory[] }

// 计算规则（判别字段 calcMode）
type UnitCalcConfig =
    | { calcMode: 'weighted'; dyfWeight: number; courseWeight: number }
    | { calcMode: 'formula'; dyfWeight: number; courseWeight: number; formula: string }

interface UnitRankConfig {
    tieRule: 'same-rank' | 'dense'   // 同分同名次跳号 / 不跳号（决策 #21：已取消 scopes）
}

interface UnitConfig {
    schemaVersion: 1
    id: string
    name: string
    version: number
    revision: number
    status: UnitConfigStatus
    unit: UnitBinding        // 绑定的二级单位 + 父级学校（决策 #34）
    class: ClassCascader     // 班级级联（学院 → 专业 → 班级）
    student: StudentField[]  // 学生端表单字段，顺序即渲染顺序
    dyf: DyfConfig
    calc: UnitCalcConfig
    rank: UnitRankConfig
    updatedAt?: EpochMs      // 仅服务端下发时附带；种子文件不含
}
```

### 2.4 学生 / 申请 / 版本

```ts
// types/student.ts
interface Student {
    id?: number
    batchId: string
    studentId: string        // 学号，批次内唯一键
    name: string
    phone?: string
    grade?: string
    major?: string
    className?: string
    idConflictLocked: boolean  // 学号冲突锁定（只能设置一次）
    nameCorrected: boolean     // 姓名已修正（仅一次）
    createdAt?: EpochMs
    updatedAt?: EpochMs
}

// types/apply.ts
type ApplyStatus = 'draft' | 'submitted' | 'imported' | 'reviewing' | 'confirmed'
type ConfirmLevel = 1 | 2 | 3    // 3=班级 / 2=年级 / 1=校级

interface Apply {
    applyId: string
    batchId: string
    studentId: string
    status: ApplyStatus
    currentRevision: number
    confirmLevel?: ConfirmLevel
    confirmBy?: string
    fileHash?: string          // 已导入文件的 SHA-256
    importedAt?: EpochMs
    dyfConfirmedAt?: EpochMs
    finalAt?: EpochMs
}

// types/revision.ts
interface Revision {
    applyId: string
    revision: number
    fileHash: string
    createdAt: EpochMs
}
```

### 2.5 分数 / 结果 / 审计

```ts
// types/dyf-score.ts
interface DyfScore {
    id?: number
    applyId: string
    itemCode: string
    category: string
    appliedScore: number
    finalScore?: number
    maxScore?: number
    allowAdd: boolean
    evidenceFiles?: string[]
}

// types/course-score.ts
interface CourseScore {
    id?: number
    batchId: string
    studentId: string
    courseName: string
    score: number
    credit?: number
}

// types/final-grade.ts
interface FinalGrade {
    id?: number
    batchId: string
    studentId: string
    dyfTotal: number
    courseTotal?: number
    finalTotal: number
    rankClass?: number
    rankMajor?: number
    rankGrade?: number
    rankSchool?: number
}

// types/audit-log.ts
type AuditRole = 'level1' | 'level2' | 'level3'
interface AuditLog {
    id?: number
    batchId?: string
    operator: string
    role: AuditRole
    scope: string
    action: string
    target?: string
    detail?: unknown
    createdAt: EpochMs
}
```

### 2.6 申请文件（`types/dyf-file.ts`）

`.dyf` 文件格式（架构 §5.1），混合加密 + 完整性校验 + 防重放：

```ts
type DyfFileType = 'apply' | 'authorization' | 'exchange'

interface DyfFile {
    schemaVersion: number
    type: DyfFileType
    applyId?: string      // 防重放
    revision?: number
    batchId?: string
    encrypted: boolean
    alg?: { rsa: RsaAlgorithm; aes: AesAlgorithm }
    iv?: string           // base64
    key?: string          // base64，RSA 加密后的会话密钥
    data?: string         // base64，AES 密文或明文 payload
    hash?: string         // payload 的 SHA-256（hex）
}
```

---

## 3. crypto — 加密与哈希

### 3.1 平台适配器（`crypto/provider.ts`）

**核心设计**：shared 不直接调用 `crypto.subtle` / `wx.*`，而是通过 `CryptoProvider` 接口注入实现。密钥句柄用 `unknown` 表示，避免依赖 DOM 的 `CryptoKey` 类型。

```ts
interface CryptoProvider {
    readonly name: string
    randomBytes(length: number): Uint8Array
    sha256(data: Uint8Array): Promise<Uint8Array>
    generateRsaOaepKeyPair(options?: RsaKeyGenOptions): Promise<{ publicKeyJwk: Jwk; privateKeyJwk: Jwk }>
    importRsaPublicKey(jwk: Jwk, algorithm?: RsaAlgorithm): Promise<unknown>
    importRsaPrivateKey(jwk: Jwk, algorithm?: RsaAlgorithm): Promise<unknown>
    rsaEncrypt(publicKey: unknown, data: Uint8Array, algorithm?: RsaAlgorithm): Promise<Uint8Array>
    rsaDecrypt(privateKey: unknown, data: Uint8Array, algorithm?: RsaAlgorithm): Promise<Uint8Array>
    aesGcmEncrypt(keyBytes: Uint8Array, plaintext: Uint8Array, options?: { iv?: Uint8Array }): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }>
    aesGcmDecrypt(keyBytes: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>
}
```

| 函数 | 说明 |
|------|------|
| `setCryptoProvider(provider)` | 注册平台适配器，各端启动时调用一次 |
| `getCryptoProvider()` | 获取当前适配器；未注册时抛错 |

**默认实现**（`crypto/webcrypto.ts`）：

| 导出 | 说明 |
|------|------|
| `webCryptoProvider` | 基于 `globalThis.crypto.subtle` 的实现（浏览器 / Node 18+） |
| `useWebCryptoProvider()` | 便捷函数：注册 `webCryptoProvider` |

### 3.2 编解码（`crypto/encoding.ts`）

纯函数实现，不依赖 `btoa`/`atob`/`TextEncoder`（小程序等环境可能缺失）。

| 函数 | 签名 | 说明 |
|------|------|------|
| `bytesToBase64` | `(bytes: Uint8Array) => string` | 字节 → base64 |
| `base64ToBytes` | `(b64: string) => Uint8Array` | base64 → 字节（忽略非法字符与填充） |
| `utf8ToBytes` | `(text: string) => Uint8Array` | 字符串 → UTF-8 字节 |
| `bytesToUtf8` | `(bytes: Uint8Array) => string` | UTF-8 字节 → 字符串 |

### 3.3 哈希（`crypto/hash.ts`）

| 函数 | 签名 | 说明 |
|------|------|------|
| `bytesToHex` | `(bytes: Uint8Array) => string` | 字节 → hex |
| `sha256Bytes` | `(data: Uint8Array) => Promise<Uint8Array>` | SHA-256 摘要（字节） |
| `sha256Hex` | `(data: Uint8Array) => Promise<string>` | SHA-256 摘要（hex，用于文件哈希） |

### 3.4 RSA-OAEP（`crypto/rsa.ts`）

| 函数 | 签名 | 说明 |
|------|------|------|
| `generateRsaKeyPair` | `(options?: { modulusLength?: number; hash?: RsaAlgorithm['hash'] }) => Promise<{ publicKeyJwk; privateKeyJwk }>` | 生成密钥对（默认 2048 / SHA-256） |
| `importRsaPublicKey` | `(jwk: Jwk, algorithm?) => Promise<unknown>` | 导入公钥（用于加密） |
| `importRsaPrivateKey` | `(jwk: Jwk, algorithm?) => Promise<unknown>` | 导入私钥（用于解密） |
| `rsaEncrypt` | `(publicKey, data, algorithm?) => Promise<Uint8Array>` | RSA-OAEP 加密 |
| `rsaDecrypt` | `(privateKey, data, algorithm?) => Promise<Uint8Array>` | RSA-OAEP 解密 |
| `verifyRsaKeyPair` | `(keyPair, algorithm?) => Promise<boolean>` | 加密→解密往返校验；密钥不匹配返回 `false`（不抛错） |

### 3.5 AES-GCM（`crypto/aes.ts`）

| 函数 | 签名 | 说明 |
|------|------|------|
| `aesGcmEncrypt` | `(keyBytes, plaintext, options?: { iv?: Uint8Array }) => Promise<{ iv; ciphertext }>` | 加密（默认自动生成 12 字节 iv） |
| `aesGcmDecrypt` | `(keyBytes, iv, ciphertext) => Promise<Uint8Array>` | 解密；密文被篡改时抛错 |

### 3.6 混合加密（`crypto/hybrid.ts`）— 核心

`.dyf` 文件生成与解析，封装了"RSA 加密会话密钥 + AES-GCM 加密 payload + SHA-256 完整性校验"全流程。

```ts
const DYF_SCHEMA_VERSION = 1

// 加密 payload → .dyf 文件
async function encryptPayload(options: {
    payload: unknown
    publicKeyJwk: Jwk
    type: DyfFileType
    applyId?: string
    revision?: number
    batchId?: string
    rsaAlgorithm?: RsaAlgorithm
    aesAlgorithm?: AesAlgorithm
    schemaVersion?: number
}): Promise<DyfFile>

// 解密 .dyf 文件 → { type, payload, hash }
async function decryptDyfFile(options: {
    file: DyfFile
    privateKeyJwk: Jwk
    rsaAlgorithm?: RsaAlgorithm
}): Promise<{ type: DyfFileType; payload: unknown; hash: string }>
```

**行为要点**：
- `encryptPayload` 自动生成 32 字节会话密钥、12 字节 iv，内嵌 payload 的 SHA-256。
- `decryptDyfFile` 解密后校验 hash，**不匹配抛错**（`文件完整性校验失败`）。
- 支持明文模式（`encrypted: false`，未启用加密的批次），同样校验 hash。
- `schemaVersion < 1` 或缺少 `type` 时抛错。

---

## 4. calc — 计算引擎

### 4.1 接口（`calc/engine.ts`）

```ts
interface CalcEngine {
    calcDyfTotal(scores: DyfScore[], config?: DyfTotalConfig): number
    calcFinalTotal(dyfTotal: number, courseTotal: number, config: CalcConfig): number
    calcRank(results: RankInput[], options?: RankOptions): RankResult[]
}
```

### 4.2 实现

| 类 | 说明 |
|----|------|
| `WeightedCalc` | 加权实现（当前 `calcMode = weighted`）。`calcFinalTotal = dyfTotal × dyfWeight + courseTotal × courseWeight`，结果保留两位小数 |
| `FormulaCalc` | 公式实现（预留，M4 接入）。所有方法调用即抛错 `formula 模式尚未实现` |

```ts
const calc = new WeightedCalc()
calc.calcDyfTotal(scores)                       // 用 finalScore 优先，回退 appliedScore
calc.calcFinalTotal(80, 90, { dyfWeight: 0.3, courseWeight: 0.7 }) // → 87
calc.calcRank([{ studentId: 'a', score: 90 }, { studentId: 'b', score: 80 }])
```

### 4.3 德育分总分（`calc/dyf-total.ts`）

```ts
// categoryCode 为分类 code（决策 #36：dyf_score.category 存 code，非中文名）
interface ScoreDetail { categoryCode: string; itemNumber: string; score: number }
interface DyfTotalConfig {
    penaltyCategoryCodes?: string[]   // 惩罚分类别 code（小计取负）
    negativeItemNumbers?: string[]    // 负分项目条目 code（单项取负）
}

function calcDyfTotal(details: ScoreDetail[], config?: DyfTotalConfig): number
function resolveDyfTotalConfig(config?: DyfTotalConfig): Required<DyfTotalConfig>
// 从单位配置的 penalty/negative 布尔标记提取上述两个 code 列表（决策 #36，标记驱动）
function extractDyfTotalConfig(config: UnitConfig | null | undefined): Required<DyfTotalConfig>
```

**规则**（标记驱动，决策 #36）：
- 惩罚分类目小计取负（`categoryCode` 在 `penaltyCategoryCodes` 中）；penalty code 来自 UnitConfig 分类的 `penalty:true` 标记。
- 负分项目单项取负（`itemNumber` 在 `negativeItemNumbers` 中）；negative code 来自条目的 `negative:true` 标记。
- **不再按中文分类名或魔法编号硬编码**；未提供 config 时不识别任何 penalty/negative（全部正向累加）。
- 非法分数（`NaN`）忽略；结果保留两位小数。

```ts
const cfg = extractDyfTotalConfig(unitConfig)   // { penaltyCategoryCodes: ['penalty'], negativeItemNumbers: ['8882'] }
calcDyfTotal([
    { categoryCode: 'base', itemNumber: '1001', score: 10 },
    { categoryCode: 'penalty', itemNumber: '9001', score: 2 },
], cfg) // → 8
```

### 4.4 排名（`calc/rank.ts`）

```ts
interface RankInput { studentId: string; score: number }
interface RankResult { studentId: string; score: number; rank: number }
interface RankOptions { tieRule?: 'same-rank' | 'dense' }  // 默认 same-rank

function calcRank(results: RankInput[], options?: RankOptions): RankResult[]
```

- `same-rank`：同分同名次，下一个不同分名次 = 已排人数 + 1（`1,2,2,4`）。
- `dense`：同分同名次，下一个不同分名次顺延一位（`1,2,2,3`）。
- 不修改原数组。

---

## 5. state — 状态机

三个状态机，均提供统一的 `canTransition` / `assertTransition` / `nextStates` / `isXxxState`。**状态单向推进，不允许回退**。

### 5.1 申请状态机（`state/apply-state.ts`）

```
draft ──导出──▶ submitted ──导入──▶ imported ──审核──▶ reviewing ──确认──▶ confirmed
```

| 导出 | 说明 |
|------|------|
| `APPLY_STATES` | `['draft', 'submitted', 'imported', 'reviewing', 'confirmed']` |
| `APPLY_TRANSITIONS` | 合法迁移表（`submitted → submitted` 允许，表示重新导出） |
| `canApplyTransition(from, to)` | 判断迁移是否合法 |
| `assertApplyTransition(from, to)` | 非法时抛错 `非法状态迁移：from → to` |
| `nextApplyStates(from)` | 返回可迁移到的目标状态 |
| `isApplyState(value)` | 类型守卫 |

### 5.2 批次状态机（`state/batch-state.ts`）

```
draft ──▶ active ──▶ closed
```

导出：`BATCH_STATES` / `BATCH_TRANSITIONS` / `canBatchTransition` / `assertBatchTransition` / `nextBatchStates` / `isBatchState`。

### 5.3 综测状态机（`state/final-state.ts`）

```
course_uploaded ──计算──▶ final_confirmed
```

导出：`FINAL_STATES` / `FINAL_TRANSITIONS` / `canFinalTransition` / `assertFinalTransition` / `nextFinalStates` / `isFinalState`。

---

## 6. validate — 校验规则

### 6.1 学生校验（`validate/student.ts`）

```ts
interface StudentInput {
    studentId?: unknown
    name?: unknown
    phone?: unknown
    grade?: unknown
    major?: unknown
    className?: unknown
}
interface StudentValidationOptions {
    studentIdPattern?: RegExp   // 默认 /^[A-Za-z0-9]{4,20}$/
    requireStudentId?: boolean  // 默认 true
    requireName?: boolean       // 默认 true
}

function validateStudentId(studentId: unknown, pattern?: RegExp): boolean
function validateStudentName(name: unknown): boolean
function validateStudent(input: StudentInput, options?: StudentValidationOptions): ValidationResult
```

### 6.2 学号冲突与可疑导入（`validate/conflict.ts`）

```ts
type ImportDecision = 'accept' | 'reject' | 'conflict'

interface ExistingStudent {
    studentId: string
    name: string
    idConflictLocked: boolean
    nameCorrected: boolean
    applyStatus?: ApplyStatus
}
interface ImportCheckInput {
    studentId: string
    name: string
    applyId?: string
    existing?: ExistingStudent   // 不存在表示首次导入
}
interface ImportCheckResult { decision: ImportDecision; reason?: string }

function checkImport(input: ImportCheckInput): ImportCheckResult
```

**判定规则**（架构 §7.2 / §7.3）：

| 场景 | 结果 |
|------|------|
| 首次导入（无已有记录） | `accept` |
| 学号+姓名均一致 | `reject`（重复导入，不覆盖首次数据；已进入审核则提示防重放） |
| 学号同、姓名不同，且学号已锁定 | `reject`（学号已锁定） |
| 学号同、姓名不同，且姓名已修正 | `reject`（姓名已修正） |
| 学号同、姓名不同，未锁定未修正 | `conflict`（需管理端处理，只能设置一次） |

### 6.3 申请校验（`validate/apply.ts`）

```ts
interface ApplyPayload {
    applyId?: unknown
    batchId?: unknown
    revision?: unknown
    personal?: Record<string, unknown>
    dyf?: unknown
}
interface ApplyValidationOptions {
    requiredPersonalFields?: string[]   // 默认 ['name', 'studentId']
}

function validateApplyPayload(payload: ApplyPayload, options?: ApplyValidationOptions): ValidationResult
```

校验项：`applyId` 非空、`batchId` 非空、`revision` 为正整数、个人信息必填字段非空。

---

## 7. 平台适配

### 7.1 浏览器 / Node 18+（含 Electron 主进程）

```ts
import { useWebCryptoProvider } from '@dys/shared'
useWebCryptoProvider()   // 应用启动时调用一次
```

### 7.2 微信小程序

小程序无 Web Crypto API，M2 起使用 shared 内置的**可移植 CryptoProvider**（`crypto/portable-provider.ts`，node-forge RSA-OAEP-SHA256 + @noble AES-GCM/SHA-256），与管理端（WebCrypto）互通由 `interop.test.ts` 验证。

```ts
// 小程序启动时（app.ts onLaunch）调用一次；实现见 user/wechat/miniprogram/utils/crypto.ts
import { setupWechatCryptoProvider } from '../../utils/crypto'
setupWechatCryptoProvider()
```

**两个关键适配点**（详见 `user/wechat/miniprogram/utils/crypto.ts`）：

1. **随机源**：`wx.getRandomValues` 是**异步** API，而 `CryptoProvider.randomBytes` 为同步接口，采用"异步预热随机池 + 同步取用"：`setupWechatCryptoProvider()` 启动时预热，导出前 `await ensureRandomPool()` 确保就绪。
2. **node-forge PRNG 种子**：RSA-OAEP 的种子取自 `forge.random`，小程序环境默认退化为 Math.random（弱随机），初始化时必须覆盖 `forge.random.seedFileSync` 指向上述强随机池。

```ts
import forge from 'node-forge'
import { setCryptoProvider } from '@dys/shared/crypto'
import { createPortableProvider } from '@dys/shared/crypto/portable-provider'

// 随机池：由 wx.getRandomValues 异步填充，同步取用（完整实现见 utils/crypto.ts）
forge.random.seedFileSync = (needed) => /* 从强随机池取 needed 字节（binary string） */
setCryptoProvider(createPortableProvider({
  randomBytes: (length) => /* 从强随机池取 length 字节 */,
}))
```

> 各端适配层是 shared 与平台之间的唯一接触点，shared 内部不出现任何平台 API。

---

## 8. 测试与构建

```sh
pnpm test          # Vitest 单元测试（83 用例）
pnpm test:coverage # 覆盖率（语句 ~94%）
pnpm type-check    # tsc --noEmit（strict + noUncheckedIndexedAccess + noUnusedLocals）
pnpm build         # 输出 dist（ESM + d.ts）
```

测试文件与源码同目录（`*.test.ts`），覆盖：加密往返/篡改、德育分总分、排名并列规则、状态机迁移、冲突判定。

---

*文档维护：修改 shared 导出 API 时同步更新本文档。*