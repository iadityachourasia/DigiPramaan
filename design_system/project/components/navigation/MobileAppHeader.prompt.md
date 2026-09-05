Use `MobileAppHeader` at the top of every mobile screen.

```jsx
<MobileAppHeader title="Record inspection" subtitle="Step 2 of 4" leading="back" actions={<IconButton icon="help" ariaLabel="Help" size="L" />} />
```

- Leading control is 44px and always labelled.
- Two trailing actions maximum; anything more goes into a `DropdownMenu`.
