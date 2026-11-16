import { createHash, randomBytes } from "node:crypto";

/**
 * Account-switch tokens (Lab 6 node N9).
 *
 * The raw token goes to the client once; only its SHA-256 is stored, on the
 * AccountHandoff row, together with the account and the device that earned
 * it and an expiry. Redeeming it marks the row consumed, so it is single use.
 */

export const SWITCH_TOKEN_TTL_MS = 10 * 60 * 1000;

export function newSwitchToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSwitchToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
