import * as crypto from 'crypto';

/**
 * Encryption utility for sensitive data like private keys
 * Uses AES-256-GCM for authenticated encryption
 */
export class CryptoUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16; // 128-bit IV
  private static readonly AUTH_TAG_LENGTH = 16; // 128-bit auth tag
  private static readonly KEY_LENGTH = 32; // 256-bit key

  /**
   * Get encryption key from environment
   * If not set, generates a random key (for development only!)
   */
  private static getEncryptionKey(): Buffer {
    const keyHex = process.env.ENCRYPTION_KEY;

    if (!keyHex) {
      // Development fallback - generate random key
      console.warn(
        '⚠️  ENCRYPTION_KEY not set! Using random key (data will be lost on restart)',
      );
      return crypto.randomBytes(this.KEY_LENGTH);
    }

    const key = Buffer.from(keyHex, 'hex');

    if (key.length !== this.KEY_LENGTH) {
      throw new Error(
        `ENCRYPTION_KEY must be ${this.KEY_LENGTH} bytes (${this.KEY_LENGTH * 2} hex chars)`,
      );
    }

    return key;
  }

  /**
   * Encrypt data using AES-256-GCM
   * Returns: Buffer containing [IV (16 bytes) + AuthTag (16 bytes) + Encrypted Data]
   */
  static encrypt(data: Uint8Array | Buffer): Buffer {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(this.IV_LENGTH);

    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Combine: IV + AuthTag + Encrypted Data
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt data encrypted with encrypt()
   * Input: Buffer containing [IV (16 bytes) + AuthTag (16 bytes) + Encrypted Data]
   * Returns: Original data as Uint8Array
   */
  static decrypt(encryptedData: Buffer): Uint8Array {
    const key = this.getEncryptionKey();

    // Extract components
    const iv = encryptedData.slice(0, this.IV_LENGTH);
    const authTag = encryptedData.slice(this.IV_LENGTH, this.IV_LENGTH + this.AUTH_TAG_LENGTH);
    const encrypted = encryptedData.slice(this.IV_LENGTH + this.AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return new Uint8Array(decrypted);
  }

  /**
   * Encrypt a Solana private key (64 bytes)
   */
  static encryptPrivateKey(privateKey: Uint8Array): Buffer {
    if (privateKey.length !== 64) {
      throw new Error('Solana private key must be 64 bytes');
    }
    return this.encrypt(privateKey);
  }

  /**
   * Decrypt a Solana private key
   */
  static decryptPrivateKey(encryptedData: Buffer): Uint8Array {
    const decrypted = this.decrypt(encryptedData);
    if (decrypted.length !== 64) {
      throw new Error('Decrypted private key is invalid (not 64 bytes)');
    }
    return decrypted;
  }

  /**
   * Generate a new encryption key (run once, save to .env)
   */
  static generateEncryptionKey(): string {
    const key = crypto.randomBytes(this.KEY_LENGTH);
    return key.toString('hex');
  }
}

