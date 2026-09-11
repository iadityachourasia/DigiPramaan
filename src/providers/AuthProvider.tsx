"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useRouter } from "@/i18n/navigation";
import { refreshSession } from "@/lib/api/auth";
import { clearToken, setToken } from "@/lib/api/client";
import { ROUTES } from "@/lib/constants";
import type { Session, User } from "@/types";

export interface AuthContextValue {
  /** Null while loading or when not authenticated. */
  user: User | null;
  /** The full session including token and expiry. */
  session: Session | null;
  /** True until the client has read the stored session. */
  loading: boolean;
  /** True in the window before `session.expiresAt`, per WCAG 2.2.1 / BRD A-11. */
  sessionWarning: boolean;
  /** Store a session after successful login. */
  signIn: (session: Session) => void;
  /** Clear all session state and navigate to login. */
  signOut: () => void;
  /**
   * The pre-expiry warning's "Stay signed in" action: exchanges the
   * refresh token for a new session. Resolves `true` on success (the
   * warning is dismissed automatically once `session` changes), `false`
   * if the refresh token itself was rejected — the caller should fall
   * back to `signOut()` in that case, since there is nothing left to
   * extend.
   */
  extendSession: () => Promise<boolean>;
}

/** Fallback if the env var is unset/unparsable — a real warning window rather than none. */
const DEFAULT_SESSION_WARN_MINUTES = 5;

/** Exported so `SessionExpiryWarning` can show the real configured window
 * in its message, rather than a duplicated read of the same env var. */
export function sessionWarnMinutes(): number {
  const parsed = Number(process.env.NEXT_PUBLIC_SESSION_WARN_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_WARN_MINUTES;
}

function sessionWarnMs(): number {
  return sessionWarnMinutes() * 60 * 1000;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = "lmcs-session";

/**
 * Same-tab change signal. The native `storage` event only fires in *other*
 * tabs, so without this a sign-in would not update the tab that performed it.
 */
const SESSION_EVENT = "lmcs-session-change";

function subscribeToSession(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SESSION_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SESSION_EVENT, onStoreChange);
  };
}

/**
 * Returns the raw stored string, not a parsed object.
 *
 * This matters: `useSyncExternalStore` compares snapshots by reference and will
 * loop forever if the getter allocates. A string from `getItem` is referentially
 * stable between reads; `JSON.parse(...)` would be a fresh object every time.
 * Parsing happens once in a `useMemo` keyed on this string.
 */
function getSessionSnapshot(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    /* Private mode, or storage disabled by policy. Treat as signed out. */
    return null;
  }
}

function getServerSessionSnapshot(): string | null {
  return null;
}

const subscribeToNothing = () => () => {};

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider — client-side session state.
 *
 * Mounted in `[locale]/layout.tsx` so it wraps both the `(public)` and `(auth)`
 * route groups. The login page needs `signIn` and lives in `(public)`, so a
 * provider mounted only in `(auth)` would leave it without a context.
 *
 * BRD §15 Q-01 resolved: role is assigned server-side. This provider stores the
 * session the login endpoint returns and never modifies the role or permissions.
 *
 * Storage is sessionStorage, read through `useSyncExternalStore` rather than an
 * effect. Reading an external store by calling `setState` inside an effect
 * triggers a cascading render on every mount, which is what
 * `react-hooks/set-state-in-effect` flags. This reads during render instead.
 *
 * The real auth method is still unresolved (BRD §15 Q-06), so this is
 * deliberately simple and is not a security boundary — see `RequireAuth`.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();

  const raw = useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    getServerSessionSnapshot
  );

  /*
   * True only during server render and the hydration pass. After hydration the
   * snapshot above is already correct, so there is no window where a real
   * session reads as absent — which is what would cause a spurious redirect.
   */
  const loading = !useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );

  /*
   * Parsing only. Expiry is deliberately NOT evaluated here: `Date.now()` is
   * impure, and a render-time comparison would only notice an expiry whenever
   * the component happened to re-render anyway. Expiry is enforced by the timer
   * below, which fires at the moment it actually happens.
   */
  const session = useMemo<Session | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }, [raw]);

  /** Clears session state without navigating. */
  const clearSession = useCallback(() => {
    clearToken();
    sessionStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(SESSION_EVENT));
  }, []);

  /*
   * Enforce expiry on a timer rather than during render. Clearing state without
   * navigating keeps routing out of the provider: a visitor reading the public
   * landing page should not be thrown to the login screen because a background
   * session lapsed. `RequireAuth` handles the redirect for pages that need one.
   */
  useEffect(() => {
    if (!session) return;
    const msRemaining = new Date(session.expiresAt).getTime() - Date.now();
    if (msRemaining <= 0) {
      clearSession();
      return;
    }
    const timer = setTimeout(clearSession, msRemaining);
    return () => {
      clearTimeout(timer);
    };
  }, [session, clearSession]);

  /*
   * BRD A-11 / WCAG 2.2.1: warn before the cutoff above fires, and offer an
   * extension. A second, independent timer rather than folding into the one
   * above — the hard cutoff must still fire exactly at `expiresAt`
   * regardless of whether the warning was ever shown or dismissed.
   *
   * `sessionWarning` is DERIVED from comparing `warnedForToken` to the
   * current session's token, the same "derive instead of store+reset"
   * shape `useRecordsList` uses for its own loading state — a fresh
   * `session` (a new token, e.g. right after `extendSession` succeeds)
   * automatically stops matching `warnedForToken` with no explicit reset
   * needed, so the effect below only ever needs to SET the flag, never
   * clear it directly.
   */
  const [warnedForToken, setWarnedForToken] = useState<string | null>(null);
  const sessionWarning = session !== null && warnedForToken === session.token;

  useEffect(() => {
    if (!session) return;
    const msUntilWarning =
      new Date(session.expiresAt).getTime() - Date.now() - sessionWarnMs();
    // Always scheduled, even at 0ms — a setState call must happen inside a
    // timer/subscription callback, never synchronously in the effect body.
    const timer = setTimeout(
      () => {
        setWarnedForToken(session.token);
      },
      Math.max(0, msUntilWarning)
    );
    return () => {
      clearTimeout(timer);
    };
  }, [session]);

  const signIn = useCallback((newSession: Session) => {
    setToken(newSession.token);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    window.dispatchEvent(new Event(SESSION_EVENT));
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    router.replace(ROUTES.login);
  }, [clearSession, router]);

  /*
   * `session` is read from the ref-stable `raw` string via `useMemo` above,
   * so capturing it in this callback's closure is safe: a stale `session`
   * here would only matter if `extendSession` could fire between two
   * `session` values without a re-render in between, which React does not
   * do for a value driven by `useSyncExternalStore`.
   */
  const extendSession = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
    const result = await refreshSession(session.refreshToken);
    if (result.outcome !== "success") return false;
    signIn(result.session);
    return true;
  }, [session, signIn]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      sessionWarning,
      signIn,
      signOut,
      extendSession,
    }),
    [session, loading, sessionWarning, signIn, signOut, extendSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
