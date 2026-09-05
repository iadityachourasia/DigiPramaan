Use `Card` to group related content into one surface.

```jsx
<Card title="Violations found" subtitle="Last 30 days" actions={<IconButton icon="more_vert" ariaLabel="Panel options" />}>
  <StatValue />
</Card>
```

- Keep `elevation` at 0–1: cards sit on the page, they do not float.
- `interactive`/`href` makes the whole card a target — then it needs a focus ring, which it has.
- Never wash a card in brand-primary; the surface is always Elevated.
