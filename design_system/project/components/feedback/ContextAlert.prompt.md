Use `ContextAlert` for a message scoped to one section or form.

```jsx
<ContextAlert status="error" title="3 fields need attention">
  Batch code, manufacture date and lab report are required before submission.
</ContextAlert>
```

- `status="error"` renders `role="alert"`; the rest are `role="status"`.
- The status glyph and title text carry the meaning — the tint alone never does.
- Status tokens are for genuine status only; never use an alert as a decorative highlight.
