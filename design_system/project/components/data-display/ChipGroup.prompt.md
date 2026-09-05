Use `ChipGroup` for the visible filter bar above a list or table.

```jsx
<ChipGroup label="Violation type" chips={[{label:'Labelling',count:64},{label:'Weight',count:22}]} selected={sel} onToggle={t} onClearAll={c} />
```

- Show counts when they help the user judge where to look.
- `Clear all` appears only once something is selected.
