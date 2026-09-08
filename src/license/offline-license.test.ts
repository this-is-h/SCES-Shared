/**
 * `.dysl` 授权文件端到端单测。
 *
 * 覆盖范围复刻 `dual-mode/poc/feasibility.mjs` 断言 2–9（签发 / 验签 / 解封 / 6 条篡改路径），
 * 并补上 POC 未覆盖的解析层与边界。
 *
 * 与 `src/types/unit-config.test.ts` 一致：用 `node:fs` 读真实契约种子，
 * 让"87 KB 配置能塞进机密段并原样取回"成为真实断言而不是玩具断言。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import type { UnitConfig } from '../types'
import { base64ToBytes, bytesToBase64 } from '../crypto/encoding'
import { generateSignKeyPair } from '../crypto/sign'
import type { SignKeyPair } from '../crypto/sign'
import { useWebCryptoProvider } from '../crypto/webcrypto'
import { LicenseError } from './errors'
import { openSecret, sealSecret } from './seal'
import {
    asOfflineLicense,
    issueOfflineLicense,
    openOfflineLicense,
    parseDysFile,
    verifyOfflineLicense,
} from './offline-license'
import type { OfflineLicenseFile, OfflineLicenseHeader, OfflineLicenseSecret, VerifyKey } from './types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SEED = (id: string): UnitConfig =>
    JSON.parse(
        readFileSync(path.resolve(HERE, '../../../SCES-Server/contracts/seed', `${id}.json`), 'utf-8'),
    ) as UnitConfig

const PASSWORD = 'K7QX-M4NP-8ZR2'
const SIGN_KEY_ID = 'vendor-2026a'
const FINGERPRINT = 'K7QX-M4NP-8ZR2'
/** 单测里把迭代次数压到最低：算法路径与 1.2M 完全相同，只是不必每个用例烧 170 ms */
const FAST_ITER = 1_000
const TIMEOUT = 60_000

let signKp: SignKeyPair
let verifyKeys: VerifyKey[]

beforeAll(async () => {
    useWebCryptoProvider()
    signKp = await generateSignKeyPair()
    verifyKeys = [{ keyId: SIGN_KEY_ID, publicKeyJwk: signKp.publicKeyJwk }]
}, TIMEOUT)

function header(patch: Partial<OfflineLicenseHeader> = {}): Omit<OfflineLicenseHeader, 'signKeyId'> {
    return {
        licenseId: '11111111-2222-3333-4444-555555555555',
        unitId: 'testTest1',
        unitName: '测试1',
        unitType: 'college',
        role: 'level1',
        scope: {},
        issuedAt: 1_750_000_000_000,
        expiresAt: 1_790_000_000_000,
        boundFingerprint: FINGERPRINT,
        maxDelegations: 64,
        profileHint: 'offline-2026s1',
        ...patch,
    }
}

function secret(configId = 'test-1'): OfflineLicenseSecret {
    return {
        unit: {
            unitId: 'testTest1',
            name: '测试1',
            unitType: 'college',
            parentUnit: { unitId: 'test', name: '测试学校' },
        },
        configTemplate: SEED(configId),
        features: { maxDelegations: 64 },
    }
}

async function issue(
    patch: Partial<OfflineLicenseHeader> = {},
    configId = 'test-1',
): Promise<OfflineLicenseFile> {
    return issueOfflineLicense({
        header: header(patch),
        secret: secret(configId),
        password: PASSWORD,
        signKeyId: SIGN_KEY_ID,
        signPrivateKeyJwk: signKp.privateKeyJwk,
        iterations: FAST_ITER,
    })
}

/** 深拷贝后施加篡改，避免用例之间互相污染。 */
function mutate(file: OfflineLicenseFile, fn: (f: OfflineLicenseFile) => void): OfflineLicenseFile {
    const copy = JSON.parse(JSON.stringify(file)) as OfflineLicenseFile
    fn(copy)
    return copy
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    await expect(promise).rejects.toMatchObject({ name: 'LicenseError', code })
}

describe('sealSecret / openSecret', () => {
    it(
        '密封解封往返一致',
        async () => {
            const enc = await sealSecret({ hello: '世界', n: 1 }, PASSWORD, FAST_ITER)
            expect(await openSecret(enc, PASSWORD)).toEqual({ hello: '世界', n: 1 })
        },
        TIMEOUT,
    )

    it(
        '算法参数与格式约定一致',
        async () => {
            const enc = await sealSecret({}, PASSWORD, FAST_ITER)
            expect(enc.alg).toEqual({ kdf: 'PBKDF2-SHA256', iterations: FAST_ITER, aes: 'AES-256-GCM' })
            expect(base64ToBytes(enc.salt)).toHaveLength(16)
            expect(base64ToBytes(enc.iv)).toHaveLength(12)
            expect(enc.hash).toMatch(/^[0-9a-f]{64}$/)
        },
        TIMEOUT,
    )

    it(
        '密文中不出现明文（口令加密确实生效）',
        async () => {
            const enc = await sealSecret({ secretName: '励行书院' }, PASSWORD, FAST_ITER)
            expect(enc.data).not.toContain('励行书院')
        },
        TIMEOUT,
    )

    it(
        '错口令 → bad-password；hash 被改 → content-corrupt',
        async () => {
            const enc = await sealSecret({ a: 1 }, PASSWORD, FAST_ITER)
            await expectCode(openSecret(enc, '错口令'), 'bad-password')
            await expectCode(openSecret({ ...enc, hash: 'f'.repeat(64) }, PASSWORD), 'content-corrupt')
        },
        TIMEOUT,
    )

    it(
        '不同次密封的 salt/iv 不重复（不是常量 IV）',
        async () => {
            const [a, b] = await Promise.all([
                sealSecret({ a: 1 }, PASSWORD, FAST_ITER),
                sealSecret({ a: 1 }, PASSWORD, FAST_ITER),
            ])
            expect(a.salt).not.toBe(b.salt)
            expect(a.iv).not.toBe(b.iv)
            expect(a.data).not.toBe(b.data)
        },
        TIMEOUT,
    )
})

describe('issueOfflineLicense / openOfflineLicense', () => {
    it(
        '签发 → 验签 → 解封，取回完整 UnitConfig',
        async () => {
            const file = await issue()
            const opened = await openOfflineLicense({
                file,
                password: PASSWORD,
                verifyKeys,
                fingerprint: FINGERPRINT,
            })
            expect(opened.configTemplate.id).toBe('test-1')
            expect(opened.configTemplate.dyf.categories.length).toBeGreaterThan(0)
            expect(opened.unit.parentUnit).toEqual({ unitId: 'test', name: '测试学校' })
        },
        TIMEOUT,
    )

    it(
        '87 KB 励行书院配置也能原样往返（4 个分类 / 106 项）',
        async () => {
            const file = await issue({ unitId: 'nxuLx', unitName: '励行书院' }, 'lixing-shuyuan')
            const opened = await openOfflineLicense({ file, password: PASSWORD, verifyKeys })
            expect(opened.configTemplate.dyf.categories).toHaveLength(4)
            expect(JSON.stringify(opened.configTemplate)).toBe(JSON.stringify(SEED('lixing-shuyuan')))
        },
        TIMEOUT,
    )

    it(
        '文件结构符合 .dysl 格式约定',
        async () => {
            const file = await issue()
            expect(file.schemaVersion).toBe(1)
            expect(file.type).toBe('offline-license')
            expect(file.sig.alg).toBe('RSA-PSS-SHA256')
            expect(file.sig.saltLength).toBe(32)
            expect(file.sig.signKeyId).toBe(SIGN_KEY_ID)
            expect(file.header.signKeyId).toBe(SIGN_KEY_ID)
        },
        TIMEOUT,
    )

    it(
        '明文头可在验签前读取（不需口令即可展示单位与到期）',
        async () => {
            const file = await issue()
            const parsed = asOfflineLicense(parseDysFile(JSON.stringify(file)))
            expect(parsed.header.unitName).toBe('测试1')
            expect(parsed.header.expiresAt).toBe(1_790_000_000_000)
        },
        TIMEOUT,
    )

    it(
        '文件中不含任何私钥（决策 #41 红线，逐字节检查）',
        async () => {
            const file = await issue()
            const text = JSON.stringify(file)
            expect(text).not.toContain('privateKeyJwk')
            expect(text).not.toContain('"d":')
            const opened = await openOfflineLicense({ file, password: PASSWORD, verifyKeys })
            expect(JSON.stringify(opened)).not.toContain('privateKeyJwk')
        },
        TIMEOUT,
    )
})

describe('篡改与错误路径（POC 断言 4–9）', () => {
    let file: OfflineLicenseFile

    beforeAll(async () => {
        file = await issue()
    }, TIMEOUT)

    const open = (f: OfflineLicenseFile, password = PASSWORD): Promise<OfflineLicenseSecret> =>
        openOfflineLicense({ file: f, password, verifyKeys, fingerprint: FINGERPRINT })

    it('篡改 header.expiresAt 被拒', async () => {
        await expectCode(
            open(mutate(file, (f) => { f.header.expiresAt = 9_999_999_999_999 })),
            'bad-signature',
        )
    }, TIMEOUT)

    it('把 boundFingerprint 改成本机机器码（换机绕过的核心攻击）被拒', async () => {
        // 攻击者拿到别人的 .dysl，想把绑定改成自己的机器码。验签先于机器码校验，所以撞的是签名。
        const attackerBound = await issue({ boundFingerprint: 'ZZZZ-ZZZZ-ZZZZ' })
        await expectCode(
            open(mutate(attackerBound, (f) => { f.header.boundFingerprint = FINGERPRINT })),
            'bad-signature',
        )
    }, TIMEOUT)

    it('把 boundFingerprint 改成 null（伪造浮动授权）被拒', async () => {
        await expectCode(
            open(mutate(file, (f) => { f.header.boundFingerprint = null })),
            'bad-signature',
        )
    }, TIMEOUT)

    it('篡改 header.unitId 被拒', async () => {
        await expectCode(open(mutate(file, (f) => { f.header.unitId = 'nxuLx' })), 'bad-signature')
    }, TIMEOUT)

    it('篡改 enc.data 密文被拒', async () => {
        await expectCode(
            open(
                mutate(file, (f) => {
                    const bytes = base64ToBytes(f.enc.data)
                    bytes[0] = bytes[0]! ^ 1
                    f.enc.data = bytesToBase64(bytes)
                }),
            ),
            'bad-signature',
        )
    }, TIMEOUT)

    it('篡改 enc.hash 被拒', async () => {
        await expectCode(open(mutate(file, (f) => { f.enc.hash = 'a'.repeat(64) })), 'bad-signature')
    }, TIMEOUT)
    it('篡改 enc.alg 的 KDF 迭代次数被拒（签名覆盖 KDF 参数，防 DoS）', async () => {
        await expectCode(
            open(
                mutate(file, (f) => {
                    f.enc.alg = { ...f.enc.alg, iterations: 1_000_000_000 }
                }),
            ),
            'bad-signature',
        )
    }, TIMEOUT)

    it('篡改 enc.alg 为非法 KDF 参数时 openSecret 返回 content-corrupt 而非原始异常', async () => {
        const bad = { ...file, enc: { ...file.enc, alg: { kdf: 'PBKDF2-SHA256' as const, iterations: -5, aes: 'AES-256-GCM' as const } } }
        await expect(openSecret(bad.enc, PASSWORD)).rejects.toMatchObject({ code: 'content-corrupt' })
    }, TIMEOUT)

    it('错误口令被拒（验签通过之后才判）', async () => {
        await expectCode(open(file, '错误口令'), 'bad-password')
    }, TIMEOUT)

    it('未知签名密钥 id 被拒', async () => {
        await expectCode(open(mutate(file, (f) => { f.sig.signKeyId = 'vendor-9999' })), 'unknown-sign-key')
    }, TIMEOUT)

    it('伪造签名（全零）被拒', async () => {
        await expectCode(
            open(mutate(file, (f) => { f.sig.value = bytesToBase64(new Uint8Array(256)) })),
            'bad-signature',
        )
    }, TIMEOUT)

    it('他人签名密钥签发的文件被拒', async () => {
        const attacker = await generateSignKeyPair()
        const forged = await issueOfflineLicense({
            header: header(),
            secret: secret(),
            password: PASSWORD,
            signKeyId: SIGN_KEY_ID, // 冒用合法 keyId
            signPrivateKeyJwk: attacker.privateKeyJwk,
            iterations: FAST_ITER,
        })
        await expectCode(open(forged), 'bad-signature')
    }, TIMEOUT)

    it('不支持的签名算法被拒', async () => {
        await expectCode(
            open(mutate(file, (f) => { (f.sig as { alg: string }).alg = 'HS256' })),
            'bad-signature',
        )
    }, TIMEOUT)

    it('机器码不匹配被拒（文件本身完好）', async () => {
        await expectCode(
            openOfflineLicense({ file, password: PASSWORD, verifyKeys, fingerprint: 'AAAA-BBBB-CCCC' }),
            'fingerprint-mismatch',
        )
    }, TIMEOUT)

    it('浮动授权（boundFingerprint = null）在任意机器上放行', async () => {
        const floating = await issue({ boundFingerprint: null })
        const opened = await openOfflineLicense({
            file: floating,
            password: PASSWORD,
            verifyKeys,
            fingerprint: 'AAAA-BBBB-CCCC',
        })
        expect(opened.unit.unitId).toBe('testTest1')
    }, TIMEOUT)

    it('已过期的文件仍可打开（过期判定不属于这一层）', async () => {
        const expired = await issue({ expiresAt: 1_000_000_000_000 })
        const opened = await openOfflineLicense({ file: expired, password: PASSWORD, verifyKeys })
        expect(opened.configTemplate.id).toBe('test-1')
    }, TIMEOUT)

    it('空验签密钥表 → unknown-sign-key（而不是静默通过）', async () => {
        await expectCode(
            openOfflineLicense({ file, password: PASSWORD, verifyKeys: [] }),
            'unknown-sign-key',
        )
    }, TIMEOUT)

    it('只验签不解封：verifyOfflineLicense 不需要口令', async () => {
        await expect(verifyOfflineLicense(file, verifyKeys)).resolves.toBeUndefined()
    }, TIMEOUT)
})

describe('parseDysFile / asOfflineLicense', () => {
    it('非 JSON → not-a-license', () => {
        expect(() => parseDysFile('这不是 JSON')).toThrow(LicenseError)
        expect(() => parseDysFile('这不是 JSON')).toThrow('不是有效的授权文件')
    })

    it.each([
        ['数组', '[]'],
        ['null', 'null'],
        ['缺 type', '{"schemaVersion":1}'],
        ['缺 schemaVersion', '{"type":"offline-license"}'],
        ['type 非字符串', '{"schemaVersion":1,"type":1}'],
    ])('%s → not-a-license', (_label, text) => {
        expect(() => parseDysFile(text)).toThrow(LicenseError)
    })

    it('schemaVersion 高于支持版本 → unsupported-version', () => {
        expect(() => parseDysFile('{"schemaVersion":99,"type":"offline-license"}')).toThrow(
            '授权文件版本过新',
        )
    })

    it('type 不是 offline-license → not-a-license（换机申请文件被正确拒绝）', () => {
        const rebind = parseDysFile('{"schemaVersion":1,"type":"rebind-request"}')
        expect(() => asOfflineLicense(rebind)).toThrow('不是单位授权文件')
    })

    it.each([
        ['头部缺 licenseId', { header: { unitId: 'a', unitName: 'b', expiresAt: 1, signKeyId: 'k', role: 'level1' } }],
        ['role 不是 level1', { header: { licenseId: 'x', unitId: 'a', unitName: 'b', expiresAt: 1, signKeyId: 'k', role: 'level3' } }],
    ])('%s → not-a-license', (_label, patch) => {
        const raw = { schemaVersion: 1, type: 'offline-license', enc: {}, sig: {}, ...patch }
        expect(() => asOfflineLicense(raw)).toThrow('授权文件头部字段缺失')
    })

    it('缺机密段 / 缺签名各有专属提示', () => {
        const base = { schemaVersion: 1, type: 'offline-license', header: header({}) }
        const withKeyId = { ...base, header: { ...base.header, signKeyId: 'k' } }
        expect(() => asOfflineLicense({ ...withKeyId, sig: { value: 'x' } })).toThrow('缺少机密段')
        expect(() =>
            asOfflineLicense({ ...withKeyId, enc: { alg: {}, data: 'x' } }),
        ).toThrow('缺少签名')
    })

    it(
        '真实文件经 JSON 落盘往返后仍可验签（文本传输场景）',
        async () => {
            const file = await issue()
            const reloaded = asOfflineLicense(parseDysFile(JSON.stringify(file, null, 2)))
            await expect(verifyOfflineLicense(reloaded, verifyKeys)).resolves.toBeUndefined()
        },
        TIMEOUT,
    )
})
