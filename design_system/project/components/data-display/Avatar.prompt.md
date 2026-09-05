Use `Avatar` in officer lists, audit feeds, comment threads and table cells.

```jsx
<Avatar name="Radhika Iyer" size="M" />
<Avatar src="/assets/officer.jpg" name="Radhika Iyer" size="L" status="online" statusLabel="Available" />
```

- Initials come from `name`, which also supplies the accessible name.
- The status dot always ships screen-reader text — a coloured dot alone says nothing.
