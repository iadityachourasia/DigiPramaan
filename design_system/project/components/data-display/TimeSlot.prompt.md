Use `TimeSlot` for booking an inspection or appointment window.

```jsx
<TimeSlot selected={slot} onSelect={setSlot} groups={[
  {label:'Morning', slots:[{time:'09:00', remaining:3},{time:'10:00', remaining:0}]}
]} />
```

- Full slots are disabled *and* labelled "Full".
- Slots are 44px tall minimum — these are tapped in the field.
