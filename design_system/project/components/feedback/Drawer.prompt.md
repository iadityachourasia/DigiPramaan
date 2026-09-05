Use `Drawer` for detail or filter panels that sit beside the main view.

```jsx
<Drawer title="Filter inspections" footer={<><Button type="text">Reset</Button><Button type="filled">Apply</Button></>}>
  …filter controls…
</Drawer>
```

- `side="bottom"` is the mobile pattern; `right` the desktop default.
- Filters apply on an explicit Apply press, not on every change.
