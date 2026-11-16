import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Salted, slow one-way hashing for verification codes and passwords.
 * Codes and passwords are never stored in the clear.
 *
 * The brief asks for bcrypt. bcrypt is not yet a backend dependency and
 * backend/package.json is a shared file, so this uses Node's built-in scrypt
 * behind the same two-function interface (hash / compare). Swapping in
 * bcryptjs at integration is a change to this file only:
 *
 *   hashSecret    -> bcrypt.hash(secret, 10)
 *   compareSecret -> bcrypt.compare(secret, stored)
 */

const N = 4096;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function derive(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_LENGTH, { N, r: R, p: P }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(secret, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function compareSecret(secret: string, stored: string): Promise<boolean> {
  const [scheme, saltText, keyText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  const actual = await derive(secret, Buffer.from(saltText, "base64url"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
