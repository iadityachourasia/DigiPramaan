Use `BiometricCapture` for authentication steps that read a biometric.

```jsx
<BiometricCapture mode="fingerprint" state="scanning" attempt={2} maxAttempts={3}
  deviceChecks={[{label:'Scanner connected', status:'ok'},{label:'Driver ready', status:'pending'}]} />
```

- Every state announces itself in words through `role="status"` — the pulse animation is decoration.
- Always show the attempt counter; lockout must never be a surprise.
- Offer a non-biometric fallback route beside this component.
