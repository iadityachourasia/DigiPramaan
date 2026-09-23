"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Alert } from "@/components/ui/Alert";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import { Link, useRouter } from "@/i18n/navigation";
import { login } from "@/lib/api/auth";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/lib/hooks";
import { loginSchema, type LoginFormValues } from "@/lib/validations/login";

/**
 * LoginForm — the seven states of `01-login.md` §4, each visually distinct.
 *
 *   1. Empty form, submit attempted  inline per-field errors, icon plus text
 *   2. Invalid username format       inline, field-specific, distinct copy
 *   3. Wrong password                page-level Alert, deliberately generic
 *   4. Server unavailable            page-level Alert, different copy, Retry
 *   5. Loading                       spinner, "Signing in…", inputs disabled
 *   6. Success                       brief confirmation, then redirect
 *   7. Session expired               warning banner, never a failure
 *
 * States 3 and 4 are kept apart on purpose. Collapsing "we rejected your
 * credentials" and "we could not reach the service" into one message tells a
 * user to re-check a password that was probably fine.
 *
 * State 3 is generic on purpose too. Saying which half was wrong confirms
 * whether an account exists, which is how an attacker enumerates usernames.
 *
 * No role selector. BRD FR-AUTH-01 and §15 Q-01, resolved 2026-09-05: the role
 * comes back with the session, assigned server-side. The caption below the
 * fields says so. The three-option selector still described in `01-login.md`
 * §7's prompt block predates that decision.
 */

/** What the page-level banner is currently showing. */
type Banner =
  | { kind: "none" }
  | { kind: "invalidCredentials" }
  | { kind: "serverUnavailable" }
  | { kind: "success" };

/**
 * MVP-only: three demo accounts, one per role, created via the Admin
 * Console's self-service "Create user" form (2026-09-24) so an officer
 * running a live demo doesn't have to type or remember credentials. Fills
 * the fields only — the officer still reviews and clicks Sign in, same as
 * the "01-login.md" flow the rest of this form follows. Remove alongside
 * the `demoBody` alert once real authentication lands (BRD §15 Q-06).
 */
const DEMO_ACCOUNTS: {
  labelKey: "inspector" | "seniorInspector" | "admin";
  username: string;
  password: string;
}[] = [
  { labelKey: "inspector", username: "fieldinspector@digipramaan.click", password: "akshatgupta" },
  { labelKey: "seniorInspector", username: "seniorinspector@digipramaan.click", password: "harshbankey" },
  { labelKey: "admin", username: "Administrator@digipramaan.click", password: "adityachourasia" },
];

export function LoginForm() {
  const t = useTranslations("login");
  const tCommon = useTranslations("common");
  const tSession = useTranslations("session");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();

  const [banner, setBanner] = useState<Banner>({ kind: "none" });
  const [showPassword, setShowPassword] = useState(false);

  /* State 7: set by RequireAuth or by the expiry timer, never by a failure. */
  const sessionExpired = searchParams.get("reason") === "expired";

  const {
    register,
    handleSubmit,
    control,
    resetField,
    setFocus,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(
      loginSchema({
        usernameRequired: t("errors.usernameRequired"),
        passwordRequired: t("errors.passwordRequired"),
        usernameFormat: t("errors.usernameFormat"),
      })
    ),
    defaultValues: { username: "", password: "", rememberMe: false },
  });

  /*
   * `useWatch` rather than `watch()`. The latter returns a fresh function on
   * every render, which the React Compiler cannot memoize safely — it bails out
   * of optimising the whole component and warns. `useWatch` is a real
   * subscription hook and does the same job.
   */
  const username = useWatch({ control, name: "username" });
  const password = useWatch({ control, name: "password" });

  /* `01-login.md` §2: the button stays disabled until both fields have content. */
  const canSubmit = username.trim().length > 0 && password.length > 0;

  /**
   * Where to go after a successful sign-in.
   *
   * `RequireAuth` appends the path it bounced, so a deep link survives the trip
   * through login. Validated before use: an absolute or protocol-relative value
   * here would be an open redirect, and bouncing back to `/login` would loop.
   */
  function resolveDestination(): string {
    const next = searchParams.get("next");
    if (!next) return ROUTES.dashboard;
    if (!next.startsWith("/") || next.startsWith("//")) return ROUTES.dashboard;
    if (next === ROUTES.login) return ROUTES.dashboard;
    return next;
  }

  /** Fills the fields with one demo account; never submits on its own. */
  function fillDemoAccount(account: (typeof DEMO_ACCOUNTS)[number]): void {
    setBanner({ kind: "none" });
    setValue("username", account.username, { shouldValidate: true, shouldDirty: true });
    setValue("password", account.password, { shouldValidate: true, shouldDirty: true });
    setFocus("password");
  }

  async function onSubmit(values: LoginFormValues): Promise<void> {
    setBanner({ kind: "none" });

    const result = await login({
      username: values.username,
      password: values.password,
      rememberMe: values.rememberMe,
    });

    /* Switch on the tag, never on truthiness — the three outcomes differ. */
    switch (result.outcome) {
      case "success":
        setBanner({ kind: "success" });
        signIn(result.session);
        router.replace(resolveDestination());
        return;

      case "invalidCredentials":
        setBanner({ kind: "invalidCredentials" });
        /*
         * §3 step 7: clear the password, keep the username. Retyping a correct
         * username because the password was wrong is pure friction.
         */
        resetField("password");
        setFocus("password");
        return;

      case "serverUnavailable":
        setBanner({ kind: "serverUnavailable" });
        return;
    }
  }

  return (
    <form
      className="lmcs-login-form-area"
      onSubmit={(event) => {
        void handleSubmit(onSubmit)(event);
      }}
      noValidate
    >
      {/* State 7 — a notice about the previous session, not a failure. */}
      {sessionExpired && banner.kind === "none" ? (
        <Alert severity="warning" title={tSession("expiredTitle")}>
          {tSession("expiredBody")}
        </Alert>
      ) : null}

      {/* State 3 */}
      {banner.kind === "invalidCredentials" ? (
        <Alert severity="error" title={t("errorTitle")} live="assertive">
          {t("errors.invalidCredentials")}
        </Alert>
      ) : null}

      {/* State 4 — distinct copy, and a recovery action the other failure lacks. */}
      {banner.kind === "serverUnavailable" ? (
        <Alert
          severity="error"
          title={t("serverErrorTitle")}
          live="assertive"
          actions={
            <button
              type="submit"
              className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
              disabled={isSubmitting}
            >
              {tCommon("actions.retry")}
            </button>
          }
        >
          {t("errors.serverUnavailable")}
        </Alert>
      ) : null}

      {/* State 6 */}
      {banner.kind === "success" ? (
        <Alert severity="success" title={t("successTitle")}>
          {t("successBody")}
        </Alert>
      ) : null}

      {/* MVP-only quick sign-in — see DEMO_ACCOUNTS' own docstring above. */}
      <div className="lmcs-login-quick-accounts">
        <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
          {t("quickSignIn.label")}
        </p>
        <div className="lmcs-login-quick-accounts-buttons">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.username}
              type="button"
              className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm"
              onClick={() => {
                fillDemoAccount(account);
              }}
              disabled={isSubmitting}
            >
              {t(`quickSignIn.${account.labelKey}`)}
            </button>
          ))}
        </div>
      </div>

      {/* States 1 and 2 surface through TextField's own error slot. */}
      <TextField
        id="login-username"
        label={t("usernameLabel")}
        hint={t("usernameHint")}
        leadingIcon="person"
        autoComplete="username"
        disabled={isSubmitting}
        {...(errors.username?.message ? { error: errors.username.message } : {})}
        {...register("username")}
      />

      <TextField
        id="login-password"
        label={t("passwordLabel")}
        type={showPassword ? "text" : "password"}
        leadingIcon="lock"
        autoComplete="current-password"
        disabled={isSubmitting}
        {...(errors.password?.message ? { error: errors.password.message } : {})}
        action={
          /*
           * The 44x44 target `01-login.md` §2 requires is guaranteed by the
           * .ux4g-input-action-btn override in globals.css, which raises the
           * package's 2x4px padding to the WCAG 2.5.5 floor.
           */
          <button
            type="button"
            className="ux4g-input-action-btn"
            onClick={() => {
              setShowPassword((prev) => !prev);
            }}
            aria-pressed={showPassword}
            aria-controls="login-password"
          >
            <span className="ux4g-icon-outlined" aria-hidden="true">
              {showPassword ? "visibility_off" : "visibility"}
            </span>
            <span className="ux4g-sr-only">
              {showPassword ? t("hidePassword") : t("showPassword")}
            </span>
          </button>
        }
        {...register("password")}
      />

      <Checkbox
        id="login-remember"
        label={t("rememberMe")}
        disabled={isSubmitting}
        {...register("rememberMe")}
      />

      <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
        {t("roleCaption")}
      </p>

      <div className="lmcs-login-actions">
        {/* State 5 */}
        <button
          type="submit"
          className="ux4g-btn ux4g-btn-primary ux4g-btn-lg"
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span
                className="ux4g-spinner ux4g-spinner-sm"
                aria-hidden="true"
              />
              {t("submitting")}
            </>
          ) : (
            t("submit")
          )}
        </button>

        {/*
          Points at Help until a real password-reset route exists. A dead link
          on a sign-in page is worse than one that reaches a page explaining who
          to contact.
        */}
        <Link href={ROUTES.help} className="lmcs-link ux4g-body-s-default">
          {t("forgotPassword")}
        </Link>
      </div>
    </form>
  );
}
