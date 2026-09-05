Use `StatCard` for the KPI row at the top of a dashboard.

```jsx
<StatCard label="Products scanned" value="12,481" delta="+4.2%" deltaDirection="up" icon="qr_code_scanner" />
<StatCard label="Compliance rate" value="93.4" unit="%" delta="-0.8%" deltaDirection="down" />
```

- Four per row is the established rhythm; keep labels to two or three words.
- "Up" is not automatically good — for violations, up is bad. The glyph shows direction, the copy carries the judgement.
