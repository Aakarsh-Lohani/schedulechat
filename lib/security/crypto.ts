import crypto from "crypto";
import { getEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
// NIST SP 800-38D recommends 96-bit (12-byte) IVs for GCM.
const IV_LENGTH = 12;

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

// ---------- OAuth CSRF State Token Helpers ----------

/**
 * Creates an HMAC-signed OAuth state token embedding the userId.
 * Format: `<userId>.<hex HMAC-SHA256>`
 *
 * The HMAC binds the state to this server's NEXTAUTH_SECRET so it cannot be
 * forged or replayed across deployments.
 */
export function createOAuthStateToken(userId: string): string {
  const key = getEncryptionKey();
  const mac = crypto.createHmac("sha256", key).update(userId).digest("hex");
  return `${userId}.${mac}`;
}

/**
 * Verifies an HMAC-signed OAuth state token and extracts the userId.
 * Returns the userId if valid, `null` if tampered or malformed.
 */
export function verifyOAuthStateToken(state: string): string | null {
  const dotIndex = state.lastIndexOf(".");
  if (dotIndex <= 0) return null;

  const userId = state.slice(0, dotIndex);
  const receivedMac = state.slice(dotIndex + 1);

  const key = getEncryptionKey();
  const expectedMac = crypto.createHmac("sha256", key).update(userId).digest("hex");

  // Constant-time comparison to prevent timing attacks
  if (receivedMac.length !== expectedMac.length) return null;
  const isValid = crypto.timingSafeEqual(
    Buffer.from(receivedMac, "hex"),
    Buffer.from(expectedMac, "hex")
  );

  return isValid ? userId : null;
}
