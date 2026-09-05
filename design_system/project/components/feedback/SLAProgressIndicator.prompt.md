Use `SLAProgressIndicator` on any case with a statutory or published turnaround.

```jsx
<SLAProgressIndicator label="Review commitment" elapsed={11} total={15} unit="days" />
<SLAProgressIndicator label="Review commitment" elapsed={17} total={15} breached />
```

- Status is derived (>=80% warns, breach errors) — override only with a real reason.
- The state text always names the condition; the bar colour repeats it, it does not carry it.
