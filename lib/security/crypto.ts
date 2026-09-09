import crypto from "crypto";
import { getEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

/**
 * Derives a 32-byte key from NEXTAUTH_SECRET.
 */
function getEncryptionKey(): Buffer {
  const secret = getEnv().NEXTAUTH_SECRET;
  return crypto.createHash("sha256").update(secret).digest();
}

export interface EncryptedData {
  ciphertext: string; // hex
  iv: string;         // hex
  tag: string;        // hex
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 */
export function encryptString(plaintext: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    tag,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 */
export function decryptString(data: EncryptedData): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(data.iv, "hex");
  const tag = Buffer.from(data.tag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
