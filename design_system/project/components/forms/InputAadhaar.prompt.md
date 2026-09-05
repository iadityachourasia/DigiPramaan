Use `InputAadhaar` wherever an Aadhaar number is captured or displayed.

```jsx
<InputAadhaar value={aadhaar} onChange={set} />
<InputAadhaar value={aadhaar} masked verified status="success" caption="Identity verified with UIDAI" />
```

- Group as 4-4-4 and set `masked` for anything shown back to the user.
- `verified` renders the verified affordance; pair with `status="success"` and a caption.
