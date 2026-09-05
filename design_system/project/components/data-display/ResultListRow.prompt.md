Use `ResultListRow` for search and discovery results.

```jsx
<ResultListRow title="Batch A-2201 — labelling violation" href="/cases/841"
  type={{label:'Case', icon:'gavel'}} path={['Maharashtra','Pune','Inspections']}
  snippet="Nutrition declaration missing on front label…" meta={['Updated 2 Sept 2026']} />
```

- Only the title is a link; the whole row is not, so keyboard users get one clear target.
- Highlight the matched term in `snippet` with `<mark>`, not colour alone.
