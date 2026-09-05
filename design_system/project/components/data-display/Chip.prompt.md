Use `Chip` for filters the user toggles, and for values entered into a Combobox.

```jsx
<Chip selected icon="check" count={128} onClick={toggle}>Violations</Chip>
<Chip onRemove={clear}>Maharashtra</Chip>
```

- Selected state is `aria-pressed` plus a check glyph, not just a tint.
- If it is not pressable, it is a `Tag`.
