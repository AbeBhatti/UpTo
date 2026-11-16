import { randomInt } from "node:crypto";

/**
 * Share slugs: the /u/{slug} in UpTo.shareLink().
 *
 * Same format as Liz's mock (web/app/(app)/create/_shared/mock.ts) and the
 * fixture's "k3f9qz": 6 characters from an alphabet without the look-alikes
 * l, o, 0 and 1, so a slug read aloud or retyped from a flyer survives.
 * 32^6 is about a billion; a clash on the unique column is retried.
 */
export const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const SLUG_LENGTH = 6;

export function newShareSlug(): string {
  return Array.from({ length: SLUG_LENGTH }, () => SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)]).join("");
}

/** Where share links point in production. The fixtures and the mock use it too. */
export const DEFAULT_SHARE_BASE_URL = "https://up-to.co";

/**
 * The origin share links should use: the web app's own origin, WEB_ORIGIN
 * (the same variable the backend's CORS reads), since /u/:slug is a page of
 * the web app. Locally that is http://localhost:3000, so a copied link opens;
 * unset, links point at production.
 */
export function shareBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const origin = env.WEB_ORIGIN?.trim();
  return origin ? origin : DEFAULT_SHARE_BASE_URL;
}

export function shareUrlFor(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/u/${slug}`;
}
