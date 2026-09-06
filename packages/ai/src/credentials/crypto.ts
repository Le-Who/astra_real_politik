import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { IdSchema } from '@astra/contracts';

const base64 = (maximum: number) => z.string().min(1).max(maximum).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const SealedSchema = z.strictObject({ nonce: base64(16), tag: base64(24), ciphertext: base64(6000) });
const EnvelopeSchema = z.strictObject({ version: z.literal(1), algorithm: z.literal('AES-256-GCM'), keyId: IdSchema, data: SealedSchema, wrappedKey: SealedSchema });
export type EncryptedCredential = z.infer<typeof EnvelopeSchema>;
type Sealed = z.infer<typeof SealedSchema>;

function decode(value: string, length?: number): Buffer {
  const buffer = Buffer.from(value, 'base64');
  if (buffer.toString('base64') !== value || (length !== undefined && buffer.length !== length)) throw new Error('INVALID_ENVELOPE');
  return buffer;
}
function seal(key: Buffer, value: Buffer, aad: Buffer): Sealed {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return { nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
function open(key: Buffer, sealed: Sealed, aad: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, decode(sealed.nonce, 12), { authTagLength: 16 });
  decipher.setAAD(aad);
  decipher.setAuthTag(decode(sealed.tag, 16));
  const first = decipher.update(decode(sealed.ciphertext));
  let last = Buffer.alloc(0);
  try { last = decipher.final(); return Buffer.concat([first, last]); }
  finally { first.fill(0); last.fill(0); }
}
function context(ownerId: string, credentialId: string, purpose: string, keyId = ''): Buffer {
  IdSchema.parse(ownerId); IdSchema.parse(credentialId);
  return Buffer.from(JSON.stringify([1, ownerId, credentialId, purpose, keyId]));
}

export class CredentialCrypto {
  #activeKeyId: string;
  #keys: Map<string, Buffer>;
  constructor(input: { activeKeyId: string; keys: Record<string, Uint8Array> }) {
    this.#activeKeyId = IdSchema.parse(input.activeKeyId);
    this.#keys = new Map(Object.entries(input.keys).map(([id, key]) => {
      IdSchema.parse(id);
      if (key.byteLength !== 32) throw new Error('INVALID_MASTER_KEY');
      return [id, Buffer.from(key)];
    }));
    if (!this.#keys.has(this.#activeKeyId)) throw new Error('INVALID_MASTER_KEY');
  }
  encrypt(ownerId: string, credentialId: string, secret: string): EncryptedCredential {
    if (typeof secret !== 'string' || secret.length < 1 || secret.length > 4096) throw new Error('INVALID_CREDENTIAL');
    const key = randomBytes(32);
    const plaintext = Buffer.from(secret);
    try {
      return { version: 1, algorithm: 'AES-256-GCM', keyId: this.#activeKeyId,
        data: seal(key, plaintext, context(ownerId, credentialId, 'data')),
        wrappedKey: seal(this.#keys.get(this.#activeKeyId)!, key, context(ownerId, credentialId, 'wrap', this.#activeKeyId)) };
    } finally { key.fill(0); plaintext.fill(0); }
  }
  decrypt(ownerId: string, credentialId: string, input: unknown): string {
    let key: Buffer | undefined;
    let plaintext: Buffer | undefined;
    try {
      const envelope = EnvelopeSchema.parse(input);
      const master = this.#keys.get(envelope.keyId);
      if (!master) throw new Error('MISSING_MASTER_KEY');
      key = open(master, envelope.wrappedKey, context(ownerId, credentialId, 'wrap', envelope.keyId));
      if (key.length !== 32) throw new Error('INVALID_DATA_KEY');
      plaintext = open(key, envelope.data, context(ownerId, credentialId, 'data'));
      return plaintext.toString('utf8');
    } catch { throw new Error('VAULT_DECRYPTION_FAILED'); }
    finally { key?.fill(0); plaintext?.fill(0); }
  }
  rewrap(ownerId: string, credentialId: string, input: unknown): EncryptedCredential {
    let key: Buffer | undefined;
    let checked: Buffer | undefined;
    try {
      const envelope = EnvelopeSchema.parse(input);
      const master = this.#keys.get(envelope.keyId);
      if (!master) throw new Error('MISSING_MASTER_KEY');
      key = open(master, envelope.wrappedKey, context(ownerId, credentialId, 'wrap', envelope.keyId));
      if (key.length !== 32) throw new Error('INVALID_DATA_KEY');
      checked = open(key, envelope.data, context(ownerId, credentialId, 'data'));
      return { ...envelope, keyId: this.#activeKeyId,
        wrappedKey: seal(this.#keys.get(this.#activeKeyId)!, key, context(ownerId, credentialId, 'wrap', this.#activeKeyId)) };
    } catch { throw new Error('VAULT_DECRYPTION_FAILED'); }
    finally { key?.fill(0); checked?.fill(0); }
  }
}
