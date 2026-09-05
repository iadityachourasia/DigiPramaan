Use `DatePicker` for a single date: inspection date, licence expiry, filing date.

```jsx
<DatePicker label="Inspection date" value="12/09/2026" selectedDay={12} today={5} />
```

- Dates display as DD/MM/YYYY.
- Today and the selection are distinguished by ring vs fill, not by colour alone.
