Use `Feedback` at the end of a task, never mid-flow.

```jsx
<Feedback type="sentiment" question="How was submitting this inspection?" value={v} onSelect={setV} comment />
```

- Every option carries a text label as well as its glyph.
- Pick one type per service and keep it consistent; `nps` only where an NPS programme actually exists.
