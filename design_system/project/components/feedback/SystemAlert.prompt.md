Use `SystemAlert` for messages about the whole service, not the current page.

```jsx
<SystemAlert status="warning" title="Scheduled maintenance" message="Scanning will be unavailable on 12 Sept, 01:00–03:00 IST." linkLabel="Read the notice" />
```

- Only one on screen, always at the very top of the shell.
- Anything about the current form or section is a `ContextAlert` instead.
