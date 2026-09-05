"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useRouter } from "@/i18n/navigation";
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
  /** Store a session after successful login. */
  signIn: (session: Session) => void;
  /** Clear all session state and navigate to login. */
  signOut: () => void;
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
   *
   * TODO (BRD A-11 / WCAG 2.2.1): a session must warn before it expires and
   * offer an extension. The `session.warning*` message keys already exist for
   * that; the warning UI itself is outstanding.
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

  const signIn = useCallback((newSession: Session) => {
    setToken(newSession.token);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    window.dispatchEvent(new Event(SESSION_EVENT));
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    router.replace(ROUTES.login);
  }, [clearSession, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signIn,
      signOut,
    }),
    [session, loading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
