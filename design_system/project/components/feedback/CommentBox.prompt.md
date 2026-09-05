Use `CommentBox` where a record needs an auditable discussion trail.

```jsx
<CommentBox comments={[{author:'R Iyer', role:'Enforcement Officer', time:'2 Sept, 14:20', text:'Label re-checked; declaration missing.'}]} />
```

- Author, role and time are mandatory on every remark — this is audit evidence.
- Remarks are additive; never let one be edited away silently.
