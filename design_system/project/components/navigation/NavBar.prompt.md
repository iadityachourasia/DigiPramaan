Use `NavBar` as the top-level shell header.

```jsx
<NavBar brand="Compliance Portal" items={[{label:'Dashboard'},{label:'Scans'},{label:'Cases'}]}
  actions={<><IconButton icon="notifications" ariaLabel="Notifications" /><Avatar name="R Iyer" size="S" /></>} />
```

- The active item carries `aria-current="page"` plus an underline — not colour alone.
- `variant="brand"` fills the bar with brand-primary. Do not extend that fill into the page body.
