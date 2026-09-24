/**
 * client.ts — base API client.
 *
 * Every domain-specific API module (records.ts, scans.ts, etc.) delegates to
 * this. It handles:
 *   - prepending the base URL from the environment,
 *   - attaching the session token when present,
 *   - returning a typed result rather than throwing on HTTP errors,
 *   - checking the mock-data flag so individual modules do not repeat it.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  status: number;
  message: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

/**
 * Whether mock data is active. Exported so API modules can branch once at
 * the top rather than checking the env var inline.
 */
export function isMockMode(): boolean {
  return USE_MOCK;
}

/**
 * Retrieve the stored session token. In mock mode this is a fake string; in
 * production it would come from an httpOnly cookie or secure storage.
 *
 * This function is deliberately simple. The real implementation depends on
 * the authentication method DoCA chooses (BRD §15 Q-06).
 */
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("lmcs-token");
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("lmcs-token", token);
  }
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("lmcs-token");
  }
}

/**
 * FastAPI's own error responses are `{"detail": "..."}` — every failure
 * branch below previously discarded that body entirely and synthesized a
 * generic "failed with status N" message, so a specific, actionable reason
 * from the backend (e.g. "A report can only be generated for a Verified
 * record") never reached the UI. Falls back to `fallback` when the body
 * isn't JSON or has no `detail`/`error` string.
 */
async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { detail?: unknown; error?: unknown }
    | null;
  const detail = body?.detail ?? body?.error;
  return typeof detail === "string" && detail.length > 0 ? detail : fallback;
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${path}`, { headers });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: await errorMessage(response, `GET ${path} failed with status ${response.status}`),
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}

export async function apiPost<T>(
  path: string,
  body: unknown
): Promise<ApiResult<T>> {
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: await errorMessage(response, `POST ${path} failed with status ${response.status}`),
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}

export async function apiPut<T>(
  path: string,
  body: unknown
): Promise<ApiResult<T>> {
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: await errorMessage(response, `PUT ${path} failed with status ${response.status}`),
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}

export async function apiUpload<T>(
  path: string,
  formData: FormData
): Promise<ApiResult<T>> {
  try {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: await errorMessage(response, `Upload to ${path} failed with status ${response.status}`),
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}
