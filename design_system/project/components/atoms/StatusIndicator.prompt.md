Use `StatusIndicator` wherever a record shows state inline.

```jsx
<StatusIndicator state="success" />
<StatusIndicator state="warning" label="Awaiting lab report" />
```

- The word is mandatory and ships by default — a coloured dot alone fails WCAG 1.4.1.
- For a boxed, higher-contrast treatment use `Tag` instead.
