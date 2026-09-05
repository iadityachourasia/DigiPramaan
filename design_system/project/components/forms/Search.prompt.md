Use `Search` above any list or table the user filters by keyword.

```jsx
<Search placeholder="Search scanned products" withButton suggestions={["Batch A-2201","Packaged water"]} />
```

- Wrapped in `role="search"`; the clear button appears only once there is a value.
- The suggestions panel is a listbox — keep rows short and never more than about eight.
