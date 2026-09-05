Use `Slot` inside composite components and kit screens to mark an extension point.

```jsx
<Card title="Regional breakdown"><Slot label="Chart" minHeight={200} /></Card>
```

- Slots are a scaffolding device: never ship one to production with the placeholder showing.
