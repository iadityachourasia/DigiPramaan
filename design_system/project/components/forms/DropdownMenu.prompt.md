Use `DropdownMenu` for a list of *actions*, not values.

```jsx
<DropdownMenu triggerLabel="Bulk actions" items={[
  {label:'Export selection', icon:'download'},
  {divider:true},
  {label:'Delete', icon:'delete', danger:true}
]} onAction={run} />
```

- `danger` items use the destructive text token and sit last, after a divider.
- Every row is keyboard reachable; disabled rows keep `aria-disabled` rather than disappearing.
