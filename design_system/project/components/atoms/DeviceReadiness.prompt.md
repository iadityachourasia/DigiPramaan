Use `DeviceReadiness` before any hardware-dependent capture step.

```jsx
<DeviceReadiness checks={[
  {label:'Scanner connected', status:'ok'},
  {label:'Driver version 2.4+', status:'fail', note:'Update required'}
]} />
```

- A failing check carries a `note` saying how to fix it.
- Run the checks before the user commits to the step, not after they press Capture.
