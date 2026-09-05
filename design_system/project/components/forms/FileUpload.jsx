import * as React from "react";

/* UX4G File Upload — Dropzone + uploaded file rows.
   Dropzone: dashed 1px border, radius 8, 24px padding. File rows show type icon,
   name, size, progress and a remove action. */
export function FileUpload({ label = "Upload documents", hint = "PDF, JPG or PNG · up to 5 MB each", files = [], status = "default", caption, multiple = true, disabled = false, onRemove, className = "", ...rest }) {
  const id = React.useId();
  const cls = ["ux4g-upload", `is-${status}`, disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  const iconFor = n => /\.pdf$/i.test(n) ? "picture_as_pdf" : /\.(jpe?g|png|webp|tiff?)$/i.test(n) ? "image" : /\.(xlsx?|csv)$/i.test(n) ? "table_view" : "description";
  return (
    <div className={cls} {...rest}>
      <label className="ux4g-field__label" htmlFor={id}>{label}</label>
      <span className="ux4g-field__hint">{hint}</span>
      <div className="ux4g-upload__zone">
        <span className="ux4g-icon ux4g-upload__zone-icon" aria-hidden="true">cloud_upload</span>
        <span className="ux4g-upload__zone-text">
          <strong>Drag files here</strong> or
          <label htmlFor={id} className="ux4g-upload__browse"> browse</label>
        </span>
        <input id={id} type="file" className="ux4g-sr-only" multiple={multiple} disabled={disabled} />
      </div>
      {files.length > 0 && (
        <ul className="ux4g-upload__list">
          {files.map((f, i) => (
            <li key={i} className={"ux4g-upload__file is-" + (f.state || "done")}>
              <span className="ux4g-icon ux4g-upload__file-icon" aria-hidden="true">{iconFor(f.name)}</span>
              <span className="ux4g-upload__file-meta">
                <span className="ux4g-upload__file-name">{f.name}</span>
                <span className="ux4g-upload__file-size">{f.size}{f.error ? " · " + f.error : ""}</span>
                {f.state === "uploading" && <span className="ux4g-upload__bar"><span style={{ width: (f.progress || 0) + "%" }} /></span>}
              </span>
              <span className="ux4g-icon ux4g-upload__file-state" aria-hidden="true">{f.state === "error" ? "error" : f.state === "uploading" ? "sync" : "check_circle"}</span>
              <button type="button" className="ux4g-field__iconbtn" aria-label={"Remove " + f.name} onClick={() => onRemove && onRemove(i)}>
                <span className="ux4g-icon" aria-hidden="true">close</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {caption && <span className="ux4g-field__caption"><span className="ux4g-icon" aria-hidden="true">{status === "error" ? "error" : "info"}</span>{caption}</span>}
    </div>
  );
}
