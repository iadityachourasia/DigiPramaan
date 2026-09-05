Use `DraftStatusBanner` at the top of any long or resumable form.

```jsx
<DraftStatusBanner referenceId="INS/2026/00841" savedAt="2 minutes ago" actions={<Button type="text" size="S">Resume later</Button>} />
```

- Always show the reference ID once one exists — it is what the user quotes on the phone.
- `autosaving` swaps the timestamp for "Saving…"; never silently discard a draft.
