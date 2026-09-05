Use `FocusRing` only where the global focus rule cannot reach — a custom widget, a map region, a canvas hit area.

```jsx
<FocusRing radius="circular"><CustomDial /></FocusRing>
```

- Never remove a focus ring without replacing it with an equally visible one.
- `inverse` on dark or brand-filled surfaces.
