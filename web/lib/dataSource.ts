/**
 * Where the web app's data comes from, decided once for every page.
 *
 * Fixtures only when NEXT_PUBLIC_USE_FIXTURES is exactly "true". Anything
 * else, including unset, is the real API, so a missing or mistyped flag can
 * never quietly put fake data in front of someone. Home, Discover and the
 * forms' API client all read this; nothing else checks the flag.
 *
 * Both values are NEXT_PUBLIC_ variables, inlined at build time.
 */
export const USE_FIXTURES = process.env.NEXT_PUBLIC_USE_FIXTURES === "true";

/** The API's base URL, without a trailing slash. Required when not using fixtures. */
export function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_API_URL is not set. Set it, or set NEXT_PUBLIC_USE_FIXTURES=true to use fixtures.");
  }
  return url.replace(/\/+$/, "");
}
