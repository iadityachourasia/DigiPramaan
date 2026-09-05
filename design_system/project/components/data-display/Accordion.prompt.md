Use `Accordion` to collapse long secondary content the user reads selectively.

```jsx
<Accordion items={[{title:'What counts as a labelling violation?', content:<p>…</p>}]} />
```

- Built on `<details>`/`<summary>`: works without JavaScript, focusable, Enter/Space toggles.
- Never hide required form fields or errors inside a collapsed panel.
