Use `Footer` at the base of every full page.

```jsx
<Footer copyright="© 2026 Government of India"
  columns={[{title:'Services', links:[{label:'Scan a product'},{label:'Report a violation'}]}]}
  accessLinks={[{label:'Accessibility statement'},{label:'RTI'},{label:'Help'}]}
  logos={<img src="/assets/logo/digital-india.svg" alt="Digital India" height="32" />} />
```

- The accessibility statement link is not optional on a government service.
- Use the real marks in `assets/logo/`; never redraw them.
