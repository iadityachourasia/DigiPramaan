Use `IconButton` when the action is unambiguous from its glyph and space is tight (table row actions, toolbars, dismissals).

```jsx
<IconButton icon="close" ariaLabel="Dismiss" />
<IconButton icon="edit" ariaLabel="Edit product" type="outlined" size="L" />
```

- `ariaLabel` is mandatory; it also becomes the tooltip.
- Use `size="L"` in any touch context — 32/40px squares are below the 44px target floor and are desktop-only.
