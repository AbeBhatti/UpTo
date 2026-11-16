/**
 * One way to call the UpTo API from Liz's screens.
 *
 * - Paths come from `ROUTES` in @upto/contracts, so a typo is a compile error.
 * - Every response is the contract envelope: { ok: true, data } | { ok: false, error }.
 * - With NEXT_PUBLIC_USE_FIXTURES=true (the .env.example default) or no
 *   NEXT_PUBLIC_API_URL, calls go to an in-memory mock driven by the fixtures
 *   (see ./mock.ts). Setting NEXT_PUBLIC_USE_FIXTURES=false switches to the real
 *   API — which is exactly step 4 of integration day.
 *
 * If Edrick ships a shared API client in `components/`, swap the body of
 * `call()` for his and keep this signature so no screen has to change.
 */
import { ROUTES, type ApiResponse, type RouteKey } from "@upto/contracts";
import { mockCall } from "./mock";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const isMockApi = process.env.NEXT_PUBLIC_USE_FIXTURES === "true" || BASE_URL === "";

export interface CallOptions {
  params?: Record<string, string>;
  body?: unknown;
}

export function resolveRoute(key: RouteKey, params: Record<string, string> = {}) {
  const [method, template] = ROUTES[key].split(" ") as [string, string];
  const path = template.replace(/:(\w+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing route param "${name}" for ${key}`);
    return encodeURIComponent(value);
  });
  return { method, path };
}

const NETWORK_ERROR = {
  ok: false,
  error: {
    code: "server_error",
    message: "Couldn't reach UpTo. Check your connection and try again.",
  },
} as const;

export async function call<T>(key: RouteKey, opts: CallOptions = {}): Promise<ApiResponse<T>> {
  const { method, path } = resolveRoute(key, opts.params);

  if (isMockApi) return mockCall<T>(key, path, opts.body);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: opts.body === undefined ? undefined : { "content-type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (json && typeof json === "object" && "ok" in json) return json as ApiResponse<T>;
    return {
      ok: false,
      error: { code: "server_error", message: `Unexpected response from the server (${res.status}).` },
    };
  } catch {
    return NETWORK_ERROR;
  }
}
