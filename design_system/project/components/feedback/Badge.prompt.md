Use `Badge` to mark unread or pending counts on an icon, avatar or tab.

```jsx
<Badge count={12}><IconButton icon="notifications" ariaLabel="Notifications" /></Badge>
<Badge type="dot" color="warning" srLabel="Action needed"><Avatar name="R Iyer" /></Badge>
```

- `type="dot"` always needs `srLabel` — a coloured dot alone conveys nothing non-visually.
- For "Approved"/"Rejected" style labels use `Tag`, not Badge.
