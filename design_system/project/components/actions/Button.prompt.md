Use `Button` for any action a user takes; it is the only component allowed to carry a brand-primary fill.

```jsx
<Button type="filled" size="L" iconLeading="check">Submit application</Button>
<Button type="outlined">Save draft</Button>
<Button type="text" danger iconLeading="delete">Withdraw</Button>
```

- One `type="filled"` button per view (the primary action). Secondary actions are `outlined`, tertiary `text`, quiet emphasis `tonal`.
- `danger` switches the whole button to the Action/Destructive token tier; never repaint a normal button red by hand.
- `size="L"` (48px) or `"XL"` (56px) meets the 44px touch-target floor on its own; `M` (40px) and `S` (32px) are for dense desktop toolbars and table rows only.
- `loading` disables the button and swaps the leading icon for the spinner.
