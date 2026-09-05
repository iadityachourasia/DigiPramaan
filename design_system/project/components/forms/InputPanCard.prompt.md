Use `InputPanCard` for PAN capture on business or licensee records.

```jsx
<InputPanCard value={pan} onChange={set} status="error" caption="PAN must match AAAAA9999A" />
```

- Input is upper-cased and letter-spaced; validate the pattern before submit, not on every keystroke.
