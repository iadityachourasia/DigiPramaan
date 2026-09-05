Use `Pagination` under any table or result list longer than one page.

```jsx
<Pagination page={3} totalPages={9} totalItems={421} pageSize={50} pageSizeOptions={[25,50,100]} onPageChange={go} />
```

- The current page uses `aria-current="page"`; every control has a visible focus ring.
- Show the range ("101–150 of 421") — page numbers alone do not tell the user where they are.
