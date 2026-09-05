Use `Carousel` for a set of images the user steps through, such as evidence photos.

```jsx
<Carousel slides={[{media:<Image src="/scans/1.jpg" alt="Front label" />, title:'Front label'}]} />
```

- Advance is manual; indicators are real buttons with `aria-current`.
- Never put essential content behind a slide the user must find.
