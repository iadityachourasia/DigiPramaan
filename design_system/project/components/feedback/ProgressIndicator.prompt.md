Use `ProgressIndicator` when work takes long enough that the user needs reassurance.

```jsx
<ProgressIndicator label="Uploading scans" value={62} showValue />
<ProgressIndicator type="circular" indeterminate size="S" label="Checking batch" />
```

- Determinate whenever a real percentage exists; `indeterminate` only when it does not.
- Use `status` for progress toward a threshold; keep it `brand` for neutral work.
