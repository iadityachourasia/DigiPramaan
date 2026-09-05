Use `ColorPicker` only where a user legitimately chooses a colour (map category, tag colour).

```jsx
<ColorPicker swatches={[{name:'Brand',value:'var(--colors-primary-600)'},{name:'Success',value:'var(--colors-green-600)'}]} value={c} onSelect={setC} />
```

- Offer token colours only; every swatch carries a screen-reader name and the selection shows a check glyph.
