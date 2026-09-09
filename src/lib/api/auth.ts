import { MOCK_CREDENTIALS, findMockUser } from "@/lib/mock";
import type { Session } from "@/types";

/**
 * Authentication client.
 *
 * Role is assigned server-side from credentials (BRD §15 Q-01). The client sends a
 * username and a password and receives a session carrying the role. It never sends a
 * role, and there is no code path here that would let it.
 *
 * TODO: BRD §15 Q-06 is unresolved — the real method may be Aadhaar-linked or
 * departmental SSO. The request and response shapes below are what a plain
 * credentials endpoint would use, which is what 01-login.md's field list assumes.
 * Swapping in the real endpoint means replacing the fetch branch, not the UI.
 */

export interface LoginRequest {
  username: string;
  password: string;
  rememberMe: boolean;
}

/**
 * Why a discriminated union rather than throwing.
 *
 * 01-login.md §4 requires three failures that look different to the user: bad
 * credentials, the service being unreachable, and ordinary field validation. Folding
 * the first two into one thrown Error is exactly how they end up sharing one message
 * and one recovery path, which is the bug that page spec is guarding against.
 */
export type LoginResult =
  | { outcome: "success"; session: Session }
  | { outcome: "invalidCredentials" }
  | { outcome: "serverUnavailable" };

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Session lifetime used by the mock. The real value comes from the backend. */
const MOCK_SESSION_MINUTES = 30;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function login(request: LoginRequest): Promise<LoginResult> {
  if (USE_MOCK) {
    /* Enough latency that the loading state is actually visible while building. */
    await delay(600);

    const match = MOCK_CREDENTIALS.find(
      (credential) =>
        credential.username.toLowerCase() === request.username.trim().toLowerCase() &&
        credential.password === request.password
    );

    if (!match) return { outcome: "invalidCredentials" };

    const user = findMockUser(match.userId);
    if (!user) return { outcome: "serverUnavailable" };

    try {
      const status = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/status`);
      if (status.status === 403) return { outcome: "invalidCredentials" };
      if (!status.ok) return { outcome: "serverUnavailable" };
    } catch {
      return { outcome: "serverUnavailable" };
    }

    return {
      outcome: "success",
      session: {
        user,
        token: `mock-session-${match.userId}`,
        expiresAt: new Date(
          Date.now() + MOCK_SESSION_MINUTES * 60 * 1000
        ).toISOString(),
      },
    };
  }

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (response.status === 401) return { outcome: "invalidCredentials" };
    if (!response.ok) return { outcome: "serverUnavailable" };

    return { outcome: "success", session: (await response.json()) as Session };
  } catch {
    /* Network failure, DNS, CORS, offline. All of it is "we could not reach it". */
    return { outcome: "serverUnavailable" };
  }
}
