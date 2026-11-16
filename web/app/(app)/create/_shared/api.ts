/**
 * One way to call the UpTo API from Liz's screens.
 *
 * - Paths come from `ROUTES` in @upto/contracts, so a typo is a compile error.
 * - Every response is the contract envelope: { ok: true, data } | { ok: false, error }.
 * - With NEXT_PUBLIC_USE_FIXTURES=true, calls go to an in-memory mock driven
 *   by the fixtures (see ./mock.ts). Anything else is the real API at
 *   NEXT_PUBLIC_API_URL; the rule lives in web/lib/dataSource.ts, shared with
 *   Home and Discover.
 *
 * If Edrick ships a shared API client in `components/`, swap the body of
 * `call()` for his and keep this signature so no screen has to change.
 */
import { ROUTES, type ApiResponse, type RouteKey } from "@upto/contracts";
import { USE_FIXTURES, apiBaseUrl } from "@/lib/dataSource";
import { mockCall } from "./mock";

export const isMockApi = USE_FIXTURES;

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

/**
 * Abe binds a switch token to the device that earned it (`x-device-id`,
 * backend/src/routes/studentVerification.route.ts). One stable id per browser,
 * kept in localStorage; if storage is unavailable we fall back to an id for
 * this page load, which still works for a verify → switch in one sitting.
 */
export const DEVICE_HEADER = "x-device-id";
const DEVICE_KEY = "upto.deviceId";
let memoryDeviceId: string | null = null;

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function deviceId(): string {
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const fresh = newId();
    window.localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    memoryDeviceId ??= newId();
    return memoryDeviceId;
  }
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

  let base: string;
  try {
    base = apiBaseUrl();
  } catch (error) {
    // Misconfigured build: say so, rather than blaming the connection.
    return { ok: false, error: { code: "server_error", message: (error as Error).message } };
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method,
      credentials: "include",
      headers: {
        [DEVICE_HEADER]: deviceId(),
        ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
      },
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
