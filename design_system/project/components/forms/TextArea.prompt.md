Use `TextArea` for free text longer than a line: inspection notes, remarks, appeal reasons.

```jsx
<TextArea label="Inspection notes" minHeight={160} maxLength={2000} showCount />
```

- Pick `minHeight` from 80 / 120 / 160 — the three heights the source defines.
- Show `showCount` only when `maxLength` genuinely constrains the user.
