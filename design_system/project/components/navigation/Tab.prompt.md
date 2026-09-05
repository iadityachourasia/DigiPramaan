Use `Tab` for alternative views of one thing — Details / Documents / History.

```jsx
<Tab activeIndex={i} onChange={setI} items={[
  {label:'Details', content:<Details/>},
  {label:'Documents', count:4, content:<Docs/>},
  {label:'History', content:<JourneyTimeline events={ev} />}
]} />
```

- Not for navigation between pages — that is `NavBar`.
- Never hide required form fields behind an inactive tab.
