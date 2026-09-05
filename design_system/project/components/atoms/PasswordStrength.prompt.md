Use `PasswordStrength` under any password-creation field.

```jsx
<PasswordStrength strength="medium" rules={[
  {label:'At least 12 characters', met:true},
  {label:'One number', met:true},
  {label:'One symbol', met:false}
]} />
```

- Show the rules from the start, not only after a failed submit.
- The three bars are decoration; the word and the checklist carry the meaning.
