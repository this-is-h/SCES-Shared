/**
 * noble.js（esbuild 打包产物，见 noble-entry.ts）的类型声明。
 * 供 shared 源码与小程序镜像类型检查使用；运行时不参与。
 */

/** AES-GCM 加密器。 */
export interface GcmCipher {
  /** 加密：返回 `ciphertext || tag(16B)`（与 WebCrypto 布局一致）。 */
  encrypt(plaintext: Uint8Array): Uint8Array
  /** 解密：密文被篡改时抛错。 */
  decrypt(ciphertext: Uint8Array): Uint8Array
}

/** AES-256-GCM 加密。key 为 32 字节会话密钥，nonce 为 12 字节 IV。 */
export declare function gcm(key: Uint8Array, nonce: Uint8Array): GcmCipher

/** SHA-256 摘要。 */
export declare function sha256(data: Uint8Array): Uint8Array

/** 密码学安全随机字节（Node/浏览器；小程序不使用，随机源为 wx.getRandomValues）。 */
export declare function randomBytes(length: number): Uint8Array
