Use `AutosaveIndicator` on any form that saves in the background.

```jsx
<AutosaveIndicator state="saved" savedAt="2 minutes ago" />
```

- `state="error"` must be sticky and explicit; silent save failure is the worst outcome on a long form.
