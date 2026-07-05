import { BadRequestException, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

interface EncryptedSecret {
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  value: string;
}

@Injectable()
export class IntegrationSecretsService {
  private key() {
    const raw = process.env.INTEGRATION_SECRET_KEY;
    if (!raw) return null;
    return createHash('sha256').update(raw).digest();
  }

  encrypt(value: string): EncryptedSecret {
    const key = this.key();
    if (!key) {
      throw new BadRequestException('INTEGRATION_SECRET_KEY is required before storing tokens');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      value: encrypted.toString('base64'),
    };
  }

  decrypt(secret: unknown): string | null {
    const key = this.key();
    if (!key || !isEncryptedSecret(secret)) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.value, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  redact(value: unknown) {
    if (!value) return null;
    return '[redacted]';
  }
}

function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as EncryptedSecret).alg === 'aes-256-gcm' &&
    typeof (value as EncryptedSecret).iv === 'string' &&
    typeof (value as EncryptedSecret).tag === 'string' &&
    typeof (value as EncryptedSecret).value === 'string'
  );
}
