Use `Tooltip` to name an icon-only control or expand an abbreviation.

```jsx
<Tooltip label="Export as CSV"><IconButton icon="download" ariaLabel="Export as CSV" /></Tooltip>
```

- Shows on hover *and* focus; the trigger is focusable so keyboard users get it too.
- Never put an action or essential-only content in a tooltip.
