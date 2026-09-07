import Image from "next/image";

import type { ScrapedListing } from "@/types";

/**
 * ListingPreview — what the scrape actually retrieved, shown before the
 * officer commits to a scan (08 §2's Scraped Preview, and a Definition of
 * Done item in its own right). Image + title + description, so a wrong
 * product is caught here rather than after a record exists.
 */

export interface ListingPreviewProps {
  listing: ScrapedListing;
  labels: {
    heading: string;
    sourceUrlLabel: string;
  };
}

export function ListingPreview({ listing, labels }: ListingPreviewProps) {
  const image = listing.images[0];

  return (
    <div className="ux4g-card ux4g-card-outline">
      <div className="ux4g-card-body lmcs-listing-preview">
        {image ? (
          <Image
            src={image.url}
            alt={image.altText}
            width={160}
            height={160}
            className="lmcs-listing-preview-img"
            unoptimized
          />
        ) : null}
        <div className="lmcs-listing-preview-text">
          <h3 className="ux4g-title-s-strong">{listing.title}</h3>
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            {listing.descriptionExcerpt}
          </p>
          <p className="ux4g-label-s-default ux4g-text-neutral-secondary lmcs-listing-preview-url">
            {labels.sourceUrlLabel}: {listing.listingUrl}
          </p>
        </div>
      </div>
    </div>
  );
}
