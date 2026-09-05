Use `Image` for content imagery that needs a caption or a stable ratio.

```jsx
<Image src="/scans/label-front.jpg" alt="Front label showing nutrition declaration" ratio="4/3" caption="Front label, batch A-2201" />
```

- Informative images need real `alt`; decorative ones pass `alt=""`.
- `state="error"` shows the fallback with text, not a silent blank box.
