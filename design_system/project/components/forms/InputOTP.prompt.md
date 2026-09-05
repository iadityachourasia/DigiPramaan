Use `InputOTP` for any 4–8 digit verification code step.

```jsx
<InputOTP length={6} value={otp} onChange={e=>setOtp(e.target.value)} attemptsLeft={2} resendIn={28} />
```

- One hidden `autoComplete="one-time-code"` input drives all boxes, so SMS autofill works.
- On failure set `status="error"` and a caption naming the reason; keep the attempt counter visible.
