Use `NotificationItem` for the right-hand notification and audit panel.

```jsx
<ul className="ux4g-notif-list">
  <NotificationItem unread status="error" icon="report" title="New violation flagged"
    message="Batch B-1189, Nagpur" time="12 minutes ago"
    action={<Button size="S" type="outlined">Open case</Button>} />
</ul>
```

- Only give `action` when there is a single obvious next step; two or more belong in the detail view.
- `time` is relative for recent items and absolute past about a week.
