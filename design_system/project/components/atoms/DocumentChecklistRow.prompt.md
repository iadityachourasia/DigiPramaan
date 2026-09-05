Use `DocumentChecklistRow` for the "what you need to supply" list on a submission.

```jsx
<ul className="ux4g-doccheck-list">
  <DocumentChecklistRow label="Lab test report" tone="accepted" meta="lab-report.pdf · 3.4 MB" />
  <DocumentChecklistRow label="Licence copy" tone="rejected" hint="Illegible — re-upload at 300 dpi"
    action={<Button size="S" type="outlined">Re-upload</Button>} />
</ul>
```

- Rejected rows must say why in `hint`. "Rejected" alone sends the user back to a call centre.
