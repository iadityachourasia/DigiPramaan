Use `InfoList` for the review step and for record detail panels.

```jsx
<InfoList layout="columns" items={[
  {label:'Product', value:'Packaged drinking water'},
  {label:'Batch', value:'A-2201'},
  {label:'Region', value:'Pune', action:<Link href="#">Change</Link>}
]} />
```

- Real `<dl>/<dt>/<dd>`, so the pairing is programmatic rather than visual.
- Put a per-row `action` on the review step so users can jump back to one field instead of restarting.
