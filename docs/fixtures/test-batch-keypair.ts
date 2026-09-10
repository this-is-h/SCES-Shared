/**
 * 测试批次密钥对（TEST ONLY —— 禁止用于任何生产批次）。
 *
 * 由 `scripts/gen-test-batch-key.mjs` 生成（Node WebCrypto，RSA-OAEP-2048/SHA-256，
 * 与 shared webcrypto provider 相同生成路径）。私钥仅存本夹具，供 shared 层 gating
 * 测试（crypto/m2-test-batch、import/m3-flow）用作自洽 RSA 对；不进入任何端产物。
 */
import type { Jwk } from "../../src/types/common"

export const testBatchId = '7b3f6c8e-4a5b-4c6d-9e8f-1a2b3c4d5e6f'

export const testBatchPublicKeyJwk: Jwk = {
  "key_ops": [
    "encrypt"
  ],
  "ext": true,
  "alg": "RSA-OAEP-256",
  "kty": "RSA",
  "n": "jXcQ5qN0eVuUIzDSjVtMlJiLs4aIELWVCVWuohyqd2whw9VTvFMDB4-mSuAWbEIVnCXOqFjalvWY7cshzriVs-gSPkzUfKWF5fFQ6bVyx9He_SPx5l0XPktiCDEFz6c9gBj_vdDI6AvclO92CD4_XeAbZqtcKgpBh4pGV6EkvIrTUxvXOWno-zUXMerkIr_RznbYNWanHkvwzgTClG7EnBVRCjxj4dLoL_8IDklO9gOu6yNqBeMOjCS2Vn0qGb2wfx3j-XEe_nSNtrv7-aN27fHJtB-XCblRYLPXdb5Z2VdCeznF9tBbHQ3VGjw0DYTouW4zmR4k0WvLi6kB33NxCQ",
  "e": "AQAB"
}

export const testBatchPrivateKeyJwk: Jwk = {
  "key_ops": [
    "decrypt"
  ],
  "ext": true,
  "alg": "RSA-OAEP-256",
  "kty": "RSA",
  "n": "jXcQ5qN0eVuUIzDSjVtMlJiLs4aIELWVCVWuohyqd2whw9VTvFMDB4-mSuAWbEIVnCXOqFjalvWY7cshzriVs-gSPkzUfKWF5fFQ6bVyx9He_SPx5l0XPktiCDEFz6c9gBj_vdDI6AvclO92CD4_XeAbZqtcKgpBh4pGV6EkvIrTUxvXOWno-zUXMerkIr_RznbYNWanHkvwzgTClG7EnBVRCjxj4dLoL_8IDklO9gOu6yNqBeMOjCS2Vn0qGb2wfx3j-XEe_nSNtrv7-aN27fHJtB-XCblRYLPXdb5Z2VdCeznF9tBbHQ3VGjw0DYTouW4zmR4k0WvLi6kB33NxCQ",
  "e": "AQAB",
  "d": "BqxmXxT4qIVwEXFrC1lSXWOtWnKXHl-siFBTEMl0prXSiXIZtUV-u_d0Ny3HTQPYkGFNtI4dgLfVBym5Hm8Be-dPngICl5841_I4eI_zWlcNk4hDr_P2Bd2pQhzq6uL3MSDsxpPv-Fdf6GQ7_5NNKrTo4gDlNAQAF6BnpVhgGudJLongHOsMcDyWmn9Cj08IxalCJEkieoNfABAG9s85Ri52vLn8bM1NbuX3vhN9ErGOuWkcUSwfzq3mVhsfSpOjow1hzuZ-cL6l14FIHH6OuACne9brIu51zjNMycpc5eSj7rsXBI--qbE02I-2IR5g5Hzc407_hnm3p-pw0JKmkQ",
  "p": "xB5AvQsBZtg31R10PwjsY5zR-s20-2MAnhd7gMO9xdT0S3LOtCovS4ByTTmtZ2o5aA-IDKfnebxDdfTk6mcgQUAlm0vZnPpnI79qz6LItcv1ygZlxnqIdyx1g42GWv-maegC95QplcXLafQB1mIWWBDRQR0cTkw5JeayZfjY3Zk",
  "q": "uKjO6uAtAS0kFf1p611y1R0oYoUOa74fPTB75xXj0d_rZwQJ95FSwTzSeHBAb0nokbx_GWcYmHYaUrYpfwQm5zQJwb7narphWYRKpzAOmnVJJHmuWShUWG-1fph52ct_PWu0Ro2QUpmWEYhok1yUr2kslOa7EHmlsVxLZFPd9PE",
  "dp": "A_AnlKQ37vzAgkMJJorjVEy92q9uxu2CAaqvDDLiCKryDOHNTMjcEkQOB4b0-HKlnHVTYg2tFEC3ihLU1fAkMas8FhY71G8iyxD48BpwtVXXJatjN80WGG6IHZAl9oXTraS_CoGrJBrIruP7dXaaxEHyMcCH5Pqa2yv6wRlyIWE",
  "dq": "FmRJ6wtSCcF6jbwT-vly8kq92ex-iiwcx6O4cpYh8RIxDmXb-4xAt7PzZa1e8t_IdtufoenxfpNbr8ntEDzlpsWVpUvL7hI5ucwj7VAThUFRpD2pGaCdUbgCDx7YL8PQYxdLXf7OkGWVX_zliXEBip-7SzcLWf0WTYJ-leThllE",
  "qi": "vHRdDjIjXE9ZQtQfc7lUZ_IiYvfTBlXqUDZaCWxQd7aAMHqriWCuO7vXTrjBhUXU7o-fPW2gdO_pCKNgae3pxEsoQdCg6RMcBu2Ooru2ADup4r9FfyugOSY6RHOyxxZe-SZ62Rsacxg84--aFsR_KLeXj6i3gev8G5nYq4uVXgU"
}

export const testBatchKeyPair = {
  publicKeyJwk: testBatchPublicKeyJwk,
  privateKeyJwk: testBatchPrivateKeyJwk,
}
