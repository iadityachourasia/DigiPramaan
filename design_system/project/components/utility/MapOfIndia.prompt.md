Use `MapOfIndia` for state or UT level distribution — a regional compliance view.

```jsx
<MapOfIndia map={<img src="/assets/map/india.svg" alt="" />} unit="%"
  regions={[{name:'Maharashtra', value:93.4, band:'High'},{name:'Bihar', value:78.1, band:'Medium'}]}
  legend={[{label:'High', color:'var(--colors-green-600)'},{label:'Medium', color:'var(--colors-orange-600)'}]} />
```

- The data table is not optional: a choropleth alone is unreadable to screen readers and to anyone with colour-vision deficiency.
- Bands need labels as well as colours, and the band appears as text per region.
- Choropleth ramps come from a single hue's ramp, not from the status tokens.
