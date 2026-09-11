import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/providers/AuthProvider";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Session } from "@/types";

/**
 * BRD A-11 / WCAG 2.2.1's pre-expiry warning + "stay signed in" extend
 * flow — the first component-level test in this repo, so kept deliberately
 * narrow: exercise `AuthProvider`'s own timers and `extendSession` logic
 * directly, rather than the full page it renders on.
 */

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const refreshSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/auth", () => ({
  refreshSession: refreshSessionMock,
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    user: {
      id: "usr-001",
      username: "inspector",
      fullName: "Field Inspector",
      email: "inspector@dp.com",
      role: "Enforcement Officer",
      department: "Department of Consumer Affairs",
      region: "Maharashtra",
      jurisdictionId: "Maharashtra",
      lastLoginAt: new Date().toISOString(),
    },
    token: "token-1",
    refreshToken: "refresh-1",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

/** Exposes context state as text so assertions don't need React internals. */
function Probe() {
  const { session, sessionWarning, signIn, extendSession } = useAuth();
  return (
    <div>
      <span data-testid="warning">{String(sessionWarning)}</span>
      <span data-testid="token">{session?.token ?? "none"}</span>
      <button
        onClick={() => {
          signIn(makeSession({ expiresAt: new Date(Date.now() + 6 * 60_000).toISOString() }));
        }}
      >
        sign in
      </button>
      <button
        onClick={() => {
          void extendSession();
        }}
      >
        extend
      </button>
    </div>
  );
}

describe("session-expiry warning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    process.env.NEXT_PUBLIC_SESSION_WARN_MINUTES = "5";
    refreshSessionMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flips sessionWarning on once inside the configured warn window, and off again after a successful extend", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("sign in").click();
    });
    expect(screen.getByTestId("token").textContent).toBe("token-1");
    expect(screen.getByTestId("warning").textContent).toBe("false");

    // Session expires in 6 minutes, warn window is 5 — advance past the
    // 1-minute mark where the warning timer is scheduled to fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByTestId("warning").textContent).toBe("true");

    refreshSessionMock.mockResolvedValue({
      outcome: "success",
      session: makeSession({
        token: "token-2",
        refreshToken: "refresh-2",
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
    });

    await act(async () => {
      screen.getByText("extend").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(refreshSessionMock).toHaveBeenCalledWith("refresh-1");
    expect(screen.getByTestId("token").textContent).toBe("token-2");
    expect(screen.getByTestId("warning").textContent).toBe("false");
  });

  it("never shows a warning without a signed-in session", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByTestId("warning").textContent).toBe("false");
  });
});
