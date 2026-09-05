import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation primitives. Use these everywhere instead of the ones from
 * "next/link" and "next/navigation" — they carry the active locale through every
 * link and redirect, which is what stops a language choice silently resetting on
 * navigation.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
