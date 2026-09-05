Use `Checkbox` for independent boolean choices and multi-select lists.

```jsx
<Checkbox label="I consent to the declaration" description="Required before submission" checked={ok} onChange={e=>setOk(e.target.checked)} />
```

- `indeterminate` renders the mixed state (parent of a partially-selected group) and sets `aria-checked="mixed"`.
- `error` swaps the border to Control/Border/Error; pair it with a caption that names the problem.
- Size L (24px box) for touch; S/M are desktop-density only.
