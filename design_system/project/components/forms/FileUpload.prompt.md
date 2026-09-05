Use `FileUpload` for document and image capture.

```jsx
<FileUpload files={[
  {name:'scan-A2201.jpg', size:'1.2 MB', state:'done'},
  {name:'lab-report.pdf', size:'3.4 MB', state:'uploading', progress:62}
]} />
```

- State is icon + text, never colour alone; `error` rows keep the reason in `error`.
- Say the accepted formats and size cap in `hint` before the user picks, not after.
