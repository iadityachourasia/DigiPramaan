Use `JourneyTimeline` for the audit history of a case or application.

```jsx
<JourneyTimeline events={[
  {title:'Notice issued', time:'2 Sept 2026, 14:20', actor:'R Iyer', role:'Enforcement Officer', icon:'gavel', status:'warning'}
]} />
```

- Order is fixed and additive; entries are never edited or removed.
- `status` tints the marker, but the title always states what happened.
