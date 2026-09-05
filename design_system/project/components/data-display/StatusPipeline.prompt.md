Use `StatusPipeline` to show where a case stands.

```jsx
<StatusPipeline stages={[
  {label:'Scanned', state:'complete', meta:'2 Sept'},
  {label:'Under review', state:'current', meta:'Assigned to R Iyer'},
  {label:'Decision', state:'pending'}
]} />
```

- Every stage names its state in text as well as its marker glyph.
- `orientation="vertical"` for narrow columns and mobile.
