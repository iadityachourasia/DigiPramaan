Use `Combobox` when the user picks from a long list and typing is faster than scrolling (states, districts, product categories).

```jsx
<Combobox label="District" options={["Pune","Nagpur","Nashik"]} value={d} onSelect={setD} />
<Combobox label="Violation types" multiple value={types} options={opts} onSelect={toggle} />
```

- `multiple` shows checkbox rows and chips in the field.
- Selection state is never colour-only — selected rows carry a check glyph.
