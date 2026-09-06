"use client";

import type { UploadedImage } from "@/types";

/**
 * SourceImageDrawer — the interaction a field's source-image badge opens
 * (13-history-and-hierarchy.md §1.1). A persistent side panel via the real
 * `ux4g-drawer-right` component (confirmed against the compiled stylesheet:
 * overlay + drawer are independent, both `position: fixed`, no required
 * parent/child nesting), chosen over an inline expand (would fight the
 * page's "highest information density" note by pushing rows apart
 * unpredictably) and a modal (the left panel already shows one image
 * persistently — a modal would duplicate that, whereas the drawer lets an
 * officer keep the field list visible while switching images).
 */

export interface SourceImageDrawerProps {
  open: boolean;
  image: UploadedImage | null;
  angleLabel: string;
  onClose: () => void;
  labels: {
    title: string;
    close: string;
  };
}

export function SourceImageDrawer({ open, image, angleLabel, onClose, labels }: SourceImageDrawerProps) {
  return (
    <>
      <div
        className={`ux4g-drawer-overlay${open ? " ux4g-drawer-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`ux4g-drawer ux4g-drawer-right${open ? " ux4g-drawer-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-image-drawer-title"
        aria-hidden={!open}
      >
        <div className="ux4g-drawer-header">
          <div className="ux4g-drawer-title-group">
            <div className="ux4g-drawer-title-wrapper">
              <span className="ux4g-drawer-title" id="source-image-drawer-title">
                {labels.title}
              </span>
            </div>
            <span className="ux4g-drawer-subtitle">{angleLabel}</span>
          </div>
          <div className="ux4g-drawer-header-actions">
            <button
              type="button"
              className="ux4g-drawer-close"
              onClick={onClose}
              aria-label={labels.close}
            >
              <span className="ux4g-icon-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        </div>
        <div className="ux4g-drawer-body">
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element -- placeholder/object-URL asset, not one next/image is meant to optimize. */
            <img
              src={image.url}
              alt={image.altText}
              className="lmcs-source-image-drawer-img"
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
