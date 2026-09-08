import { beforeAll, describe, expect, it } from 'vitest'
import { generateRsaKeyPair, useWebCryptoProvider } from '../crypto'
import { generateSignKeyPair, type SignKeyPair } from '../crypto/sign'
import type { Jwk } from '../types'
import {
    LicenseError,
    asUnitCert,
    asUnitPubkeyPackage,
    issueUnitCert,
    issueUnitPubkeyPackage,
    verifyUnitCert,
    verifyUnitPubkeyPackage,
    type UnitCertPayload,
    type UnitPubkeyPayload
} from './index'

let vendor: SignKeyPair
let unitSign: SignKeyPair
let apply: { publicKeyJwk: Jwk; privateKeyJwk: Jwk }

beforeAll(async () => {
    useWebCryptoProvider()
    vendor = await generateSignKeyPair()
    unitSign = await generateSignKeyPair()
    apply = await generateRsaKeyPair()
})

function pubkeyPayload(): UnitPubkeyPayload {
    return {
        licenseId: 'L-1',
        unitId: 'nxuLx',
        boundFingerprint: 'AAAA-BBBB-CCCC',
        signKey: { keyId: 'nxuLx-sign-1', publicKeyJwk: unitSign.publicKeyJwk },
        applyKey: { keyId: 'nxuLx-k1', publicKeyJwk: apply.publicKeyJwk },
        issuedAt: 1000
    }
}

describe('.dysk 单位公钥包（单位签发私钥自签）', () => {
    it('自签往返：验过', async () => {
        const pkg = await issueUnitPubkeyPackage({
            payload: pubkeyPayload(),
            signPrivateKeyJwk: unitSign.privateKeyJwk
        })
        await expect(verifyUnitPubkeyPackage(pkg)).resolves.toBeUndefined()
    })

    it('篡改 payload（改 unitId）→ 验签失败', async () => {
        const pkg = await issueUnitPubkeyPackage({
            payload: pubkeyPayload(),
            signPrivateKeyJwk: unitSign.privateKeyJwk
        })
        pkg.payload.unitId = 'evil'
        await expect(verifyUnitPubkeyPackage(pkg)).rejects.toBeInstanceOf(LicenseError)
    })

    it('sig.signKeyId 与内含签发公钥 keyId 不一致 → 拒绝', async () => {
        const pkg = await issueUnitPubkeyPackage({
            payload: pubkeyPayload(),
            signPrivateKeyJwk: unitSign.privateKeyJwk
        })
        pkg.sig.signKeyId = 'someone-else'
        await expect(verifyUnitPubkeyPackage(pkg)).rejects.toBeInstanceOf(LicenseError)
    })

    it('用他人私钥自签（冒充持有签发私钥）→ 拒绝', async () => {
        const attacker = await generateSignKeyPair()
        const pkg = await issueUnitPubkeyPackage({
            payload: pubkeyPayload(),
            signPrivateKeyJwk: attacker.privateKeyJwk
        })
        await expect(verifyUnitPubkeyPackage(pkg)).rejects.toBeInstanceOf(LicenseError)
    })

    it('asUnitPubkeyPackage 拒绝缺字段', () => {
        expect(() => asUnitPubkeyPackage({ type: 'unit-pubkey', payload: {} })).toThrow(LicenseError)
    })
})

function certPayload(): UnitCertPayload {
    return {
        unitId: 'nxuLx',
        licenseId: 'L-1',
        signKey: { keyId: 'nxuLx-sign-1', publicKeyJwk: unitSign.publicKeyJwk },
        applyKey: { keyId: 'nxuLx-k1', publicKeyJwk: apply.publicKeyJwk },
        issuedAt: 1000,
        notAfter: 1790000000000
    }
}

describe('.dysc 单位证书（服务商签名）', () => {
    it('服务商签名往返：用服务商公钥验过', async () => {
        const cert = await issueUnitCert({
            payload: certPayload(),
            signKeyId: 'vendor-2026a',
            signPrivateKeyJwk: vendor.privateKeyJwk
        })
        await expect(
            verifyUnitCert(cert, [{ keyId: 'vendor-2026a', publicKeyJwk: vendor.publicKeyJwk }])
        ).resolves.toBeUndefined()
    })

    it('篡改 notAfter（级联失效开关）→ 验签失败', async () => {
        const cert = await issueUnitCert({
            payload: certPayload(),
            signKeyId: 'vendor-2026a',
            signPrivateKeyJwk: vendor.privateKeyJwk
        })
        cert.payload.notAfter = 9999999999999
        await expect(
            verifyUnitCert(cert, [{ keyId: 'vendor-2026a', publicKeyJwk: vendor.publicKeyJwk }])
        ).rejects.toBeInstanceOf(LicenseError)
    })

    it('伪造证书（用非服务商密钥自签）→ 未知签名密钥被拒', async () => {
        const forger = await generateSignKeyPair()
        const cert = await issueUnitCert({
            payload: certPayload(),
            signKeyId: 'vendor-2026a',
            signPrivateKeyJwk: forger.privateKeyJwk
        })
        await expect(
            verifyUnitCert(cert, [{ keyId: 'vendor-2026a', publicKeyJwk: vendor.publicKeyJwk }])
        ).rejects.toBeInstanceOf(LicenseError)
    })

    it('asUnitCert 拒绝缺 notAfter', () => {
        expect(() =>
            asUnitCert({ type: 'unit-cert', payload: { unitId: 'x', licenseId: 'y' } })
        ).toThrow(LicenseError)
    })
})
