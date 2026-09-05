# Page 1 — Login

> See `00-README.md` for the Status Model, Role Permission Matrix, and Fixed
> Vocabulary this file assumes. Fixed in this revision: role naming now uses
> full names throughout; this page is confirmed standalone with no shared
> shell (the shell is built starting on page 2, the first authenticated page).

## 1. Purpose & Why It Matters

This is the only page every user type touches before anything else, and for
a government enforcement tool it needs to read as secure and official, not
like a consumer SaaS sign-in. Enforcement officers will use this page
repeatedly during fieldwork and live demonstrations, so it needs to be fast
and unambiguous under pressure. Role determines what the rest of the app
shows — see the Role Permission Matrix in the README — so getting role
handling right here has downstream effects on every other page.

## 2. Sections & Fields

### Branding
- Project name / short title (e.g. "Legal Metrology Compliance System")
- Department reference (Department of Consumer Affairs, Ministry of Consumer
  Affairs, Food & Public Distribution)
- One-line description of what the system does
- Government of India / National Emblem placement per your UX4G header
  conventions, if specified

### Login Form
- Username or email field
- Password field with a show/hide toggle (44x44px tap target)
- Both fields need real associated `<label>` elements, not placeholder-only

### Role
- Role selector with all three roles: **Enforcement Officer**, **Admin**,
  **Reviewer** — OR, if role is assigned server-side from credentials, omit
  the selector and show a caption noting this. Decide and document which
  approach you're using now, since Dashboard/Sidebar visibility depends on it.

### Actions
- Primary: Login button (disabled until both fields have content)
- Secondary: Forgot Password link
- Optional: Remember Me checkbox

### Validation
- Required-field messages inline under the relevant field, icon + text
- Invalid-credentials message is always generic ("Invalid username or
  password") — never confirms which field was wrong

### Loading State
- Button shows spinner + "Signing in…" text, fields and button disabled

### Session State
- Automatic redirect to Dashboard on success
- A session-expired re-entry shows a distinct message ("Your session
  expired — please sign in again"), never conflated with a login failure

## 3. User Flow

1. User lands on Login (directly, or redirected here after session expiry)
2. User enters credentials, and role if using a selector
3. Frontend validates non-empty/format before any network call
4. On submit, button enters loading state, request sent to backend
5. Backend authenticates, returns session/token + role
6. Frontend stores auth state, redirects to Dashboard
7. On failure: loading clears, inline error appears, password field clears
   (username/email field does not)

## 4. States & Edge Cases

| State | What the user sees |
|---|---|
| Empty form, submit attempted | Inline required-field messages, icon + text |
| Invalid email/username format | Inline format error, specific to that field |
| Wrong password | Generic "Invalid username or password" |
| Server unavailable | Distinct message + Retry action, different copy from wrong credentials |
| Loading | Disabled fields/button, "Signing in…" label |
| Successful login | Brief success state (optional) then redirect |
| Session expired (redirected here) | Distinct banner, not conflated with login failure |

## 5. UX4G / Design Notes

- Reuse `Input`, `Button`, `Checkbox` from the shared component library —
  don't build one-off form controls.
- Input borders: `Border/Neutral/Strong` at rest, `Control/Border/Error` on
  validation failure.
- Keep brand-primary fill limited to the Login button and any identity
  mark — the rest should stay neutral so this reads as a service.
- Error/success messaging pairs a status token with icon and text.
- Visible focus states on every field and the button.

## 6. Definition of Done

- [ ] Both fields have real `<label>` elements
- [ ] All 7 states above are visually distinct and implemented
- [ ] Password field has a show/hide toggle with a 44x44px target
- [ ] Role handling decision (selector vs. backend-assigned) is explicit
- [ ] Role selector, if used, offers exactly Enforcement Officer / Admin /
      Reviewer — written in full, never shortened
- [ ] No raw hex values or primitive tokens anywhere on this page
- [ ] Tab-through confirms logical focus order with visible focus rings

## 7. Claude Design Prompt

```
Build the Login page. This is a standalone page with no shared app shell —
the user isn't authenticated yet, so there's no sidebar or header nav here.

Reuse existing components: Input, Button, Checkbox. Do not create new
one-off form styling — if an existing component doesn't fit, tell me before
improvising.

Sections needed:
- Branding block: project name, Department of Consumer Affairs reference,
  one-line description
- Login form: username/email field, password field with show/hide toggle
- Role selector offering exactly three options, written in full: Enforcement
  Officer, Admin, Reviewer (if we're instead assigning role from the backend
  automatically, tell me and I'll confirm which approach to use before you
  build this)
- Actions: Login button (disabled until both fields filled), Forgot
  Password link, Remember Me checkbox

States to implement, all visually distinct:
1. Empty form / required-field validation (inline, icon + text)
2. Invalid email/username format
3. Wrong password — generic message, never field-specific
4. Server unavailable — distinct copy + Retry action
5. Loading — disabled fields/button, "Signing in…" label
6. Successful login → redirect to Dashboard
7. Session expired (arriving here via redirect) — distinct banner, not
   conflated with login failure

Constraints: input borders use Border/Neutral/Strong at rest and
Control/Border/Error on failure, never the default border token. No
color-only error signaling — pair with icon and text. Every interactive
element needs a visible focus state and a real associated label.

Check this against our design system rules before finalizing and flag
anything that couldn't fully comply instead of approximating it.
```
