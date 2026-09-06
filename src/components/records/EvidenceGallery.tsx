import Image from "next/image";

import { EmptyState } from "@/components/shared";
import { formatShortDate } from "@/lib/utils/format";
import type { Evidence } from "@/types";

/**
 * EvidenceGallery — Attached Evidence (06-product-compliance-detail.md §2),
 * a distinct section from Source & Extracted Data's `capturedImages` (see
 * the page 6 plan's resolution B) — this reads `record.evidence`, which
 * carries a caption and attribution `capturedImages` has no field for.
 * No attach-evidence action exists yet (nothing in the spec's Actions list
 * names one), so this is read-only display of whatever's already there.
 */

export interface EvidenceGalleryProps {
  evidence: readonly Evidence[];
  locale: string;
  labels: {
    emptyTitle: string;
    emptyBody: string;
    attachedOn: (date: string) => string;
  };
}

export function EvidenceGallery({ evidence, locale, labels }: EvidenceGalleryProps) {
  if (evidence.length === 0) {
    return <EmptyState icon="photo_library" title={labels.emptyTitle} description={labels.emptyBody} />;
  }

  return (
    <div className="lmcs-evidence-gallery">
      {evidence.map((item) => (
        <div key={item.id} className="ux4g-card ux4g-card-outline">
          <div className="ux4g-card-body lmcs-evidence-card">
            <Image
              src={item.image.url}
              alt={item.image.altText}
              width={160}
              height={160}
              className="lmcs-evidence-thumb"
              unoptimized
            />
            <p className="ux4g-body-s-default">{item.caption}</p>
            <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {labels.attachedOn(formatShortDate(item.attachedAt, locale))}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
