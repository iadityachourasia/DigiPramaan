Use `Toggle` for settings that take effect immediately.

```jsx
<Toggle label="Notify me about new violations" checked={on} onChange={e=>setOn(e.target.checked)} />
```

- Renders `role="switch"`; the label states what being on means, never "On/Off".
- Never use it as a form field that only commits on submit — that is a Checkbox.
