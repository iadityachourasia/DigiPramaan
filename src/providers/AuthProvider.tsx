"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { setToken, clearToken } from "@/lib/api/client";
import type { Session, User } from "@/types";

export interface AuthContextValue {
  /** Null while loading or when not authenticated. */
  user: User | null;
  /** The full session including token and expiry. */
  session: Session | null;
  /** True during the initial hydration check. */
  loading: boolean;
  /** Store a session after successful login. */
  signIn: (session: Session) => void;
  /** Clear all session state and navigate to login. */
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider — client-side session state.
 *
 * BRD §15 Q-01 resolved: role is server-assigned. This provider stores the
 * session returned by the login endpoint and exposes it to the component tree.
 * It never modifies the role or permissions.
 *
 * The real auth method (Aadhaar, SSO, plain credentials) is still unresolved
 * (BRD §15 Q-06), so the storage is deliberately simple: sessionStorage for
 * the token, React state for the session object. The provider re-checks on
 * mount by reading the stored session.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("lmcs-session");
      if (stored) {
        const parsed = JSON.parse(stored) as Session;
        const expired = new Date(parsed.expiresAt).getTime() < Date.now();
        if (!expired) {
          setSession(parsed);
          setToken(parsed.token);
        } else {
          sessionStorage.removeItem("lmcs-session");
          clearToken();
        }
      }
    } catch {
      sessionStorage.removeItem("lmcs-session");
      clearToken();
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback((newSession: Session) => {
    setSession(newSession);
    setToken(newSession.token);
    sessionStorage.setItem("lmcs-session", JSON.stringify(newSession));
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    clearToken();
    sessionStorage.removeItem("lmcs-session");
  }, []);

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
