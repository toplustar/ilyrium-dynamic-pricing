import * as crypto from 'crypto';
import { Buffer } from 'buffer';
export class CryptoUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly KEY_LENGTH = 32;

  static encrypt(data: Uint8Array | Buffer): Buffer {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(this.IV_LENGTH);

    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);

    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]);
  }

  static decrypt(encryptedData: Buffer): Uint8Array {
    const key = this.getEncryptionKey();

    const iv = encryptedData.slice(0, this.IV_LENGTH);
    const authTag = encryptedData.slice(this.IV_LENGTH, this.IV_LENGTH + this.AUTH_TAG_LENGTH);
    const encrypted = encryptedData.slice(this.IV_LENGTH + this.AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return new Uint8Array(decrypted);
  }

  static encryptPrivateKey(privateKey: Uint8Array): Buffer {
    if (privateKey.length !== 64) {
      throw new Error('Solana private key must be 64 bytes');
    }
    return this.encrypt(privateKey);
  }

  static decryptPrivateKey(encryptedData: Buffer): Uint8Array {
    const decrypted = this.decrypt(encryptedData);
    if (decrypted.length !== 64) {
      throw new Error('Decrypted private key is invalid (not 64 bytes)');
    }
    return decrypted;
  }

  static generateEncryptionKey(): string {
    const key = crypto.randomBytes(this.KEY_LENGTH);
    return key.toString('hex');
  }

  private static getEncryptionKey(): Buffer {
    const keyHex = process.env.ENCRYPTION_KEY;

    if (!keyHex) {
      return crypto.randomBytes(this.KEY_LENGTH);
    }

    const key = Buffer.from(keyHex, 'hex');

    if (key.length !== this.KEY_LENGTH) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
    }

    return key;
  }
}
