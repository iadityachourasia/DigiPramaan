Use `Stepper` on any application or submission split across steps.

```jsx
<Stepper activeIndex={1} onStepClick={go} steps={[
  {label:'Product details'},{label:'Upload scans'},{label:'Inspection notes'},{label:'Review & submit'}
]} />
```

- Completed steps are re-clickable; upcoming ones are not.
- Each step announces its state to screen readers, so the tick is not the only signal.
- `orientation="vertical"` when labels are long or the column is narrow.
