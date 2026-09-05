Use `InputTextField` for any single-line text entry.

```jsx
<InputTextField label="Product name" required placeholder="e.g. Packaged drinking water" />
<InputTextField label="Batch code" status="error" caption="Batch code must be 8 characters" />
```

- `label` is mandatory. `hint` explains the field before entry; `caption` reports the result after.
- `status` drives border, caption colour and caption icon together — status is never colour alone.
- Size L (48px) for mobile and touch-heavy officer workflows.
