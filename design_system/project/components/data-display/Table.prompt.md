Use `Table` for record lists the user scans, sorts and selects.

```jsx
<Table selectable size="M" zebra="rows"
  columns={[{key:'name',label:'Product',sortable:true},{key:'status',label:'Status'}]}
  rows={[{key:1,name:<ThumbnailCell/>,status:<Tag color="error" icon="error">Violation</Tag>}]}
  footer={<Pagination page={1} totalPages={9} />} />
```

- Status cells use `Tag` with an icon — never a bare coloured dot.
- Rows are focusable and show the focus ring; selection uses real checkboxes with per-row labels.
- Always pass `emptyState` (an `EmptyState`) — a blank tbody reads as broken.
