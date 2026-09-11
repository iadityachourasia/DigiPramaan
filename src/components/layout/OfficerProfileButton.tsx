"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/lib/hooks";

/**
 * OfficerProfileButton — the header's account control: an initials avatar,
 * name and role, opening a small menu with "View Profile" and "Logout".
 *
 * Replaces the old static, non-interactive user block plus the standalone
 * logout button that used to sit next to it — this is the one interactive
 * surface for both, so there is never a duplicate logout affordance.
 *
 * There is no dropdown/menu component anywhere else in this codebase to
 * reuse, so this follows the WAI-ARIA menu-button pattern directly: a real
 * `<button aria-haspopup="menu">` trigger, a `role="menu"` popup with
 * `role="menuitem"` children, Escape/outside-click/focus-return handling
 * modelled on this project's existing `FlagManufacturerDialog.tsx` keyboard
 * pattern (document-level keydown listener, cleaned up on close), plus
 * roving ArrowUp/ArrowDown focus between the two items. Exactly two items
 * exist, so each gets its own named ref rather than an indexed array —
 * assigning into a ref array via an inline callback inside `.map()` trips
 * the `react-hooks/refs` lint rule.
 *
 * `User` (src/types/user.ts) has no avatar/photo field today, so the avatar
 * is always the UX4G initials avatar (`.ux4g-avatar`) — never a fabricated
 * image. All displayed content comes from the real authenticated session
 * (`useAuth().user`); nothing here is hardcoded or sample data.
 */

function initialsFor(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
}

export function OfficerProfileButton() {
  const t = useTranslations();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const viewProfileRef = useRef<HTMLButtonElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);
  /*
   * Whether the menu should send focus to the first item once it renders —
   * a ref, not state: it's read-and-cleared inside an effect, and calling
   * setState synchronously inside an effect body is itself a lint error
   * (react-hooks/set-state-in-effect), so this flag deliberately lives
   * outside React's render cycle.
   */
  const focusFirstPendingRef = useRef(false);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleViewProfile() {
    close();
    router.push(ROUTES.profile);
  }

  function handleLogout() {
    close();
    signOut();
  }

  function itemRefAt(index: 0 | 1) {
    return index === 0 ? viewProfileRef : logoutRef;
  }

  function focusItem(index: number) {
    const wrapped = ((index % 2) + 2) % 2;
    itemRefAt(wrapped as 0 | 1).current?.focus();
  }

  function handleTriggerClick() {
    setOpen((v) => !v);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      focusFirstPendingRef.current = true;
      setOpen(true);
    }
  }

  function handleMenuItemKeyDown(index: 0 | 1, event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(index - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      // Standard menu-dismissal-on-blur behaviour: let Tab move focus out of
      // the menu in normal document order rather than trapping it.
      setOpen(false);
    }
  }

  // Focus the first item once the menu has actually rendered, when it was
  // opened via keyboard rather than a mouse click.
  useEffect(() => {
    if (open && focusFirstPendingRef.current) {
      focusFirstPendingRef.current = false;
      viewProfileRef.current?.focus();
    }
  }, [open]);

  // Escape (when focus is still on the trigger) and click-outside both close
  // the menu. Item-level Escape is handled in handleMenuItemKeyDown so it
  // always returns focus via the same `close()`.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    function onMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  if (!user) return null;

  const roleLabel = t(`vocabulary.role.${user.role}`);

  return (
    <div className="lmcs-profile-control" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="lmcs-profile-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="officer-profile-menu"
        aria-label={t("navigation.accountMenuFor", { fullName: user.fullName, role: roleLabel })}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="ux4g-avatar ux4g-avatar-s" aria-hidden="true">
          {initialsFor(user.fullName)}
        </span>
        <span className="lmcs-profile-trigger-text">
          <span className="ux4g-label-m-default">{user.fullName}</span>
          <span className="ux4g-tag ux4g-tag-tonal-primary ux4g-tag-s">
            <span className="ux4g-icon-outlined" aria-hidden="true">
              badge
            </span>
            {roleLabel}
          </span>
        </span>
        <span
          className={`ux4g-icon-outlined lmcs-profile-trigger-chevron${open ? " lmcs-profile-trigger-chevron-open" : ""}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {open ? (
        <div id="officer-profile-menu" role="menu" className="lmcs-profile-menu">
          <button
            ref={viewProfileRef}
            type="button"
            role="menuitem"
            className="lmcs-profile-menu-item"
            onClick={handleViewProfile}
            onKeyDown={(event) => handleMenuItemKeyDown(0, event)}
          >
            {t("navigation.viewProfile")}
          </button>
          <button
            ref={logoutRef}
            type="button"
            role="menuitem"
            className="lmcs-profile-menu-item"
            onClick={handleLogout}
            onKeyDown={(event) => handleMenuItemKeyDown(1, event)}
          >
            {t("navigation.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
