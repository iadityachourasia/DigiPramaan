"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState, useSyncExternalStore } from "react";

import { LoadingSpinner } from "@/components/shared";
import { Alert } from "@/components/ui/Alert";
import { Checkbox } from "@/components/ui/Checkbox";
import { Link, useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/lib/hooks";
import type { NotificationSettings } from "@/types";

const STORAGE_KEY = "lmcs-notification-settings";

const DEFAULT_SETTINGS: NotificationSettings = { inApp: true, email: false, sms: false };

/** Nothing outside this tab changes the value, so the subscription is a no-op. */
function subscribeToNothing(): () => void {
  return () => undefined;
}

function readStoredSettings(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Server snapshot. Null so the first client render matches and cannot mismatch. */
function readNoStoredSettings(): string | null {
  return null;
}

function parseSettings(raw: string | null): Partial<NotificationSettings> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<NotificationSettings>;
  } catch {
    return {};
  }
}

/**
 * ProfileView — Profile & Settings (10 §2).
 *
 * Everything on this page reads the signed-in user; there is no fetch,
 * because `useAuth().user` already carries every `ProfileDetails` field plus
 * region and last login.
 *
 * PASSWORD CHANGE IS DISABLED, NOT FAKED
 * ---------------------------------------
 * There is no authentication backend (BRD §15 Q-06 is still unresolved), so
 * the form renders with its reason stated rather than showing a success
 * message for something that did not happen. On a government security
 * surface, a user who believes their password changed when it did not is
 * worse off than one told plainly that the feature is not wired yet — this
 * is the one mock this product should not ship.
 */
export function ProfileView() {
  const t = useTranslations("profile");
  const tVocab = useTranslations("vocabulary");
  const { user, signOut } = useAuth();
  const router = useRouter();

  /*
   * Per-viewer convenience only, so localStorage is the right home: nothing
   * here needs to be seen from another device or read back by the server.
   *
   * Read through `useSyncExternalStore` rather than an effect, which is the
   * same mechanism `AuthProvider` uses for the stored session and the reason
   * this does not hydrate with the wrong value: the server snapshot is
   * explicitly null, so the first client render matches and only then picks
   * up what is stored. An effect that called setState here would also trip
   * `react-hooks/set-state-in-effect`.
   *
   * Every accessor is wrapped: a private window, cleared site data, or a
   * browser set to block storage makes `localStorage` itself throw.
   */
  const [overrides, setOverrides] = useState<Partial<NotificationSettings>>({});

  const stored = useSyncExternalStore(
    subscribeToNothing,
    readStoredSettings,
    readNoStoredSettings
  );

  const settings: NotificationSettings = {
    ...DEFAULT_SETTINGS,
    ...parseSettings(stored),
    ...overrides,
  };

  const updateSetting = useCallback(
    (key: keyof NotificationSettings, value: boolean) => {
      setOverrides((prev) => ({ ...prev, [key]: value }));
      try {
        const next = { ...DEFAULT_SETTINGS, ...parseSettings(readStoredSettings()) };
        next[key] = value;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* A viewer who cannot store this still gets a working toggle. */
      }
    },
    []
  );

  if (!user) {
    return <LoadingSpinner label={t("loading")} />;
  }

  const fields: Array<{ label: string; value: string }> = [
    { label: t("fields.fullName"), value: user.fullName },
    { label: t("fields.username"), value: user.username },
    { label: t("fields.email"), value: user.email },
    { label: t("fields.role"), value: tVocab(`role.${user.role}`) },
    { label: t("fields.department"), value: user.department },
    { label: t("fields.region"), value: user.region },
  ];

  return (
    <div className="lmcs-page-section">
      <section aria-labelledby="account-heading" className="lmcs-page-section-block">
        <h2 id="account-heading" className="ux4g-title-m-strong">
          {t("account.heading")}
        </h2>

        <dl className="lmcs-profile-fields">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">
                {field.label}
              </dt>
              <dd className="ux4g-body-m-default">{field.value}</dd>
            </div>
          ))}
        </dl>

        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {t("account.roleNote")}
        </p>
      </section>

      <section aria-labelledby="security-heading" className="lmcs-page-section-block">
        <h2 id="security-heading" className="ux4g-title-m-strong">
          {t("security.heading")}
        </h2>

        <Alert severity="info" title={t("security.unavailableTitle")}>
          {t("security.unavailableBody")}
        </Alert>

        <button type="button" className="ux4g-btn ux4g-btn-outline-primary" disabled>
          {t("security.changePassword")}
        </button>
      </section>

      <section aria-labelledby="notifications-heading" className="lmcs-page-section-block">
        <h2 id="notifications-heading" className="ux4g-title-m-strong">
          {t("notifications.heading")}
        </h2>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {t("notifications.body")}
        </p>

        <div className="lmcs-profile-toggles">
          <Checkbox
            id="notify-in-app"
            label={t("notifications.inApp")}
            checked={settings.inApp}
            onChange={(event) => updateSetting("inApp", event.target.checked)}
          />
          {/*
            Email and SMS are typed but not wired — BRD §15 Q-08 has not
            settled whether either is required at launch, so they stay
            disabled rather than offering a switch that does nothing.
          */}
          <Checkbox
            id="notify-email"
            label={t("notifications.email")}
            checked={settings.email}
            disabled
            onChange={() => undefined}
          />
          <Checkbox
            id="notify-sms"
            label={t("notifications.sms")}
            checked={settings.sms}
            disabled
            onChange={() => undefined}
          />
        </div>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {t("notifications.channelsNote")}
        </p>
      </section>

      <section aria-labelledby="session-heading" className="lmcs-page-section-block">
        <h2 id="session-heading" className="ux4g-title-m-strong">
          {t("session.heading")}
        </h2>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {t("session.lastLogin", {
            date: new Date(user.lastLoginAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </p>
        <div className="lmcs-report-actions">
          <button
            type="button"
            className="ux4g-btn ux4g-btn-outline-primary"
            onClick={() => {
              signOut();
              router.push(ROUTES.login);
            }}
          >
            {t("session.logout")}
          </button>
          <Link href={ROUTES.reports} className="ux4g-btn ux4g-btn-text-primary">
            {t("session.backToReports")}
          </Link>
        </div>
      </section>
    </div>
  );
}
