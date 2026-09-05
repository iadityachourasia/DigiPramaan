Use `RadioButton` for one-of-many choices where every option should stay visible.

```jsx
<FormFieldGroup legend="Inspection outcome">
  <RadioButton name="outcome" value="pass" label="Compliant" checked={v==='pass'} onChange={...} />
  <RadioButton name="outcome" value="fail" label="Violation found" checked={v==='fail'} onChange={...} />
</FormFieldGroup>
```

- All radios in a set share one `name`.
- More than about seven options: use `Combobox` or `DropdownMenu` instead.
