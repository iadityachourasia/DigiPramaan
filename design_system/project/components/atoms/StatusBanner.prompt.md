Use `StatusBanner` at the top of any case or application detail view.

```jsx
<StatusBanner status="inreview" title="Under review by the district office"
  referenceId="INS/2026/00841" since="2 Sept 2026" nextStep="Decision expected by 17 Sept" />
```

- Always give `nextStep` when one is known — "what happens next" is the question the user actually has.
- Tone follows status; never pick a tone for emphasis.
