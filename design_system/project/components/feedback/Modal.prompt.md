Use `Modal` only when the user must decide before continuing.

```jsx
<Modal title="Confirm enforcement action" status="warning"
  description="A penalty notice will be issued to the licensee."
  secondaryAction={<Button type="outlined">Cancel</Button>}
  primaryAction={<Button type="filled" danger>Issue notice</Button>} />
```

- Primary action last, on the right; destructive primaries use `danger`.
- Never use a modal for information the page could show inline — that is a ContextAlert.
