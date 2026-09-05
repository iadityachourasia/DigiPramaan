Use `EmptyState` wherever a list, table or panel can legitimately be empty.

```jsx
<EmptyState icon="search_off" variant="search" title="No products match these filters"
  description="Try widening the date range or clearing the region filter."
  primaryAction={<Button type="outlined">Clear filters</Button>} />
```

- Title says what is missing; description says the next action.
- The source ships empty-state artwork; swap `icon` for that illustration when it is available.
