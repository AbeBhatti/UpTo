/**
 * Where to go after signing in. Only same-site paths are followed, so a
 * crafted ?next=https://elsewhere cannot bounce someone off the app.
 */
export function safeNext(next: string | null, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
