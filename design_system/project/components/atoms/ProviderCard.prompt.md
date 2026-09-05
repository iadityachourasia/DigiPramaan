Use `ProviderCard` on the sign-in and identity-verification choice screens.

```jsx
<ProviderCard name="Aadhaar OTP" description="Verify with a one-time password to your registered mobile" recommended />
<ProviderCard name="Fingerprint" icon="fingerprint" disabled unavailableNote="No scanner detected on this device" />
```

- A disabled method must say why; a greyed card with no reason is a dead end.
- Use the real provider mark where the source file has one.
