Use `Slider` for ranges the user judges by feel (thresholds, tolerances, radius).

```jsx
<Slider label="Compliance threshold" value={80} unit="%" showTicks showValues />
```

- The numeric `<output>` is not optional — a track alone is unreadable to screen readers and to anyone estimating a value.
- When the exact figure matters, use `InputTextField` instead.
