Use `Breadcrumb` on any page more than one level deep.

```jsx
<Breadcrumb items={[{label:'Home',href:'/',icon:'home'},{label:'Inspections',href:'/i'},{label:'INS/2026/00841'}]} />
```

- The current page carries `aria-current="page"` and is never a link.
- Set `maxVisible` on deep trails rather than letting them wrap.
