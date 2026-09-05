Use `AccessibilityBar` as the first element on every full page of a government service.

```jsx
<AccessibilityBar textScale={s} onTextScale={setS} contrast={c} onContrast={setC} />
```

- `onContrast` should set `data-mode="high-contrast-white"` / `"high-contrast-black"` on `:root` — those modes exist in the token file.
- The skip link must be the first focusable element in the DOM.
- Language labels render in their own script, in Noto Sans.
