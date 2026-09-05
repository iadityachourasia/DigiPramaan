Use `AttemptCounter` beside every rate-limited verification step.

```jsx
<AttemptCounter remaining={1} total={3} lockoutNote="Your account locks for 30 minutes after this attempt." />
```

- Say the consequence before the last attempt is spent, not after.
