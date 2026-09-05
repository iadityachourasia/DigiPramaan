Use `Tag` for status and category labels.

```jsx
<Tag color="success" icon="check_circle">Compliant</Tag>
<Tag color="error" icon="error">Violation found</Tag>
<Tag color="warning" icon="schedule">Pending review</Tag>
```

- Status tags must pair the semantic colour with an icon and a word (WCAG 1.4.1).
- Semantic colours are for real status only; category tags use `neutral` or `brand`.
- `onRemove` turns it into a dismissible filter token — that is `Chip`'s job if it is interactive input.
