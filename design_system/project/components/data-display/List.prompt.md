Use `List` for the icon + text + timestamp row pattern.

```jsx
<List items={[
  {icon:'qr_code_scanner', title:'Batch A-2201 scanned', supporting:'Pune district', meta:'2 min ago'},
  {icon:'gavel', title:'Notice issued', supporting:'INS/2026/00841', meta:'1 hr ago'}
]} />
```

- Put the timestamp in `meta`, actions in `trailing`.
- `interactive` makes rows focusable — only when the row actually does something.
