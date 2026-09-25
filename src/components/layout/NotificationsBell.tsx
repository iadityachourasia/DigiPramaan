"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useUnreadNotificationCount } from "@/lib/hooks";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/notifications";
import { notificationIcon, resolveNotificationLink } from "@/lib/utils/notifications";
import type { NotificationEntry } from "@/types";

/**
 * NotificationsBell — the header's real notification control. Replaces the
 * disabled placeholder (which showed a fabricated count from
 * MOCK_DASHBOARD_ALERTS and had no onClick at all).
 *
 * Follows OfficerProfileButton.tsx's own from-scratch WAI-ARIA menu-button
 * pattern (there is still no shared dropdown primitive in this codebase) —
 * with one deliberate difference: that component uses two fixed, individually
 * named refs for its two static items, because (per its own comment)
 * assigning into a ref array via an inline .map() callback trips this
 * project's react-hooks/refs lint rule. This menu's item count is dynamic
 * (however many recent notifications exist), so roving ArrowUp/ArrowDown
 * focus is implemented via a single container ref + querySelectorAll at
 * keydown time instead of a per-item ref array — no lint conflict, same
 * WAI-ARIA menu behaviour.
 */
export function NotificationsBell() {
  const t = useTranslations("notifications");
  const { count, refresh } = useUnreadNotificationCount();

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationEntry[] | null>(null);
  const [recordLabels, setRecordLabels] = useState<Record<string, string>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusFirstPendingRef = useRef(false);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const menuItems = useCallback((): HTMLElement[] => {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }, []);

  const focusItemAt = useCallback(
    (index: number) => {
      const items = menuItems();
      if (items.length === 0) return;
      const wrapped = ((index % items.length) + items.length) % items.length;
      items[wrapped]?.focus();
    },
    [menuItems]
  );

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

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const items = menuItems();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItemAt(currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItemAt(currentIndex - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  useEffect(() => {
    if (open && focusFirstPendingRef.current) {
      focusFirstPendingRef.current = false;
      focusItemAt(0);
    }
  }, [open, focusItemAt]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function onMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  // Load the preview list once, each time the menu opens — the badge count
  // (a cheap poll) is the thing that stays live while closed.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchNotifications({ read: undefined, types: [] }, 1, 6).then((result) => {
      if (cancelled || !result.ok) return;
      // Unread-first within this small preview page — a real sort mode
      // isn't worth a new backend param for six rows.
      const sorted = [...result.data.rows].sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt));
      setRows(sorted);
      setRecordLabels(result.data.recordLabels);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function handleRowClick(entry: NotificationEntry) {
    if (entry.readAt) return;
    setRows((current) =>
      current?.map((row) => (row.id === entry.id ? { ...row, readAt: new Date().toISOString() } : row)) ?? current
    );
    void markNotificationRead(entry.id).then(() => refresh());
  }

  function handleMarkAllRead() {
    setRows((current) => current?.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })) ?? current);
    void markAllNotificationsRead().then(() => refresh());
  }

  return (
    <div className="lmcs-notification-bell" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="ux4g-btn ux4g-btn-text-neutral lmcs-header-action"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="notifications-bell-menu"
        aria-label={count > 0 ? t("bell.unreadLabel", { count }) : t("bell.label")}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="ux4g-icon-outlined" aria-hidden="true">
          notifications
        </span>
        {count > 0 ? (
          <span className="ux4g-badge-digit-primary lmcs-notification-bell-badge" aria-hidden="true">
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id="notifications-bell-menu"
          role="menu"
          className="lmcs-notification-bell-menu"
          ref={menuRef}
        >
          <div className="lmcs-notification-bell-menu-header">
            <span className="ux4g-title-s-strong">{t("bell.label")}</span>
            {count > 0 ? (
              <button
                type="button"
                role="menuitem"
                className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
                onClick={handleMarkAllRead}
                onKeyDown={handleMenuKeyDown}
              >
                {t("bell.markAllRead")}
              </button>
            ) : null}
          </div>

          {rows === null ? null : rows.length === 0 ? (
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary lmcs-notification-bell-menu-header">
              {t("bell.empty")}
            </p>
          ) : (
            <ul className="lmcs-notification-bell-menu-list">
              {rows.map((entry) => {
                const href = resolveNotificationLink(entry) ?? ROUTES.notifications;
                const unread = !entry.readAt;
                return (
                  <li key={entry.id}>
                    <Link
                      href={href}
                      role="menuitem"
                      className="lmcs-notification-link"
                      onClick={() => {
                        handleRowClick(entry);
                        close();
                      }}
                      onKeyDown={handleMenuKeyDown}
                    >
                      <span className="ux4g-icon-outlined lmcs-notification-icon" aria-hidden="true">
                        {notificationIcon(entry.type)}
                      </span>
                      <span className="lmcs-notification-body">
                        <span className={unread ? "ux4g-body-s-strong" : "ux4g-body-s-default"}>
                          {t(`type.${entry.type}.message`, entry.detail as Record<string, string>)}
                        </span>
                        {entry.recordId && recordLabels[entry.recordId] ? (
                          <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
                            {t("recordPrefix", { scanId: recordLabels[entry.recordId]! })}
                          </span>
                        ) : null}
                      </span>
                      {unread ? <span className="lmcs-notification-unread-dot" aria-hidden="true" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="lmcs-notification-bell-menu-footer">
            <Link
              href={ROUTES.notifications}
              role="menuitem"
              className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
              onClick={close}
              onKeyDown={handleMenuKeyDown}
            >
              {t("bell.viewAll")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
