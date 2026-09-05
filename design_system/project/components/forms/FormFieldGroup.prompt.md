Use `FormFieldGroup` around any set of controls that answer one question.

```jsx
<FormFieldGroup legend="Enforcement action" required caption="Select one outcome">
  <RadioButton name="a" label="Warning issued" />
  <RadioButton name="a" label="Penalty imposed" />
</FormFieldGroup>
```

- Renders `<fieldset><legend>` — this is what makes radio/checkbox sets accessible.
- `layout="grid"` gives the two-column form rhythm used on long metadata forms.
- Row spacing comes from Stack tokens, column gaps from Inline tokens.
