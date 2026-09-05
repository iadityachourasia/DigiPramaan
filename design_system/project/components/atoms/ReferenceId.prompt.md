Use `ReferenceId` anywhere a record has a quotable number.

```jsx
<ReferenceId value="INS/2026/00841" onCopy={copy} copied={done} />
```

- Never truncate or ellipsise the value — the whole point is reading it aloud.
- The copy confirmation is a word plus a glyph, so it is not colour-only.
