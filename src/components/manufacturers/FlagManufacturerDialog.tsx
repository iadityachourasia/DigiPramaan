"use client";

import { useEffect, useRef } from "react";

import type { ComplianceRecord } from "@/types";

/**
 * FlagManufacturerDialog — the confirmation for manufacturer-scoped Flag for
 * Enforcement (09 §4).
 *
 * This exists because the action is a fan-out, not a single write: one click
 * flags every Non-Compliant record inside the threshold window. An
 * Enforcement Officer must see the exact scope — how many records, and which
 * ones — before committing, not discover afterwards that one button touched
 * six records. So the dialog lists them by name.
 */

export interface FlagManufacturerDialogProps {
  open: boolean;
  manufacturerName: string;
  /** The records this action would flag — Non-Compliant, inside the window. */
  records: readonly ComplianceRecord[];
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  labels: {
    title: string;
    body: string;
    recordsHeading: string;
    confirm: string;
    confirming: string;
    cancel: string;
  };
}

export function FlagManufacturerDialog({
  open,
  manufacturerName,
  records,
  pending,
  onConfirm,
  onCancel,
  labels,
}: FlagManufacturerDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  /*
   * Modal keyboard behaviour, written out rather than assumed: focus moves
   * into the dialog on open, Escape closes it, and Tab cycles within it so
   * a keyboard user can't wander into the page behind an aria-modal overlay
   * they can still reach. `<dialog>`'s native showModal() would give this
   * for free, but it can't be styled through the UX4G card composition
   * without fighting the browser's own backdrop.
   */
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input, select, textarea"
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="lmcs-dialog-backdrop">
      <div
        ref={dialogRef}
        className="ux4g-card ux4g-card-solid lmcs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-manufacturer-title"
      >
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="flag-manufacturer-title" className="ux4g-title-m-strong">
            {labels.title}
          </h2>
          <p className="ux4g-body-m-default">{labels.body}</p>

          <h3 className="ux4g-label-l-default ux4g-text-neutral-secondary">
            {labels.recordsHeading}
          </h3>
          <ul className="lmcs-dialog-record-list">
            {records.map((record) => (
              <li key={record.id} className="ux4g-body-s-default">
                {record.productName}
              </li>
            ))}
          </ul>

          <div className="lmcs-dialog-actions">
            <button
              ref={confirmRef}
              type="button"
              className="ux4g-btn ux4g-btn-primary"
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? labels.confirming : labels.confirm}
            </button>
            <button
              type="button"
              className="ux4g-btn ux4g-btn-outline-primary"
              onClick={onCancel}
              disabled={pending}
              aria-label={`${labels.cancel}: ${manufacturerName}`}
            >
              {labels.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
