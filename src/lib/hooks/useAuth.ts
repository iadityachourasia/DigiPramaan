"use client";

import { useContext } from "react";

import { AuthContext, type AuthContextValue } from "@/providers/AuthProvider";
import { ROLE_PERMISSIONS, type Permission, type Role } from "@/types";

/**
 * useAuth — access session state and permission checks.
 *
 * Must be called inside an AuthProvider. Throws if used outside one, which is
 * intentional — it surfaces the wiring bug immediately rather than silently
 * returning nulls that cause a downstream crash.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}

/**
 * Check a single permission against the current user's role.
 * Returns false if the user is not authenticated.
 */
export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

/**
 * Check whether the current user's role matches any in the given list.
 * Useful for conditional rendering of sidebar items or page sections.
 */
export function useHasRole(...roles: Role[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return roles.includes(user.role);
}
