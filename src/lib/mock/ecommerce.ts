/**
 * E-commerce Listing Scanner fixtures (page 8).
 *
 * 00-README.md §E draws the line this file sits on: these listings have no physical
 * photograph at all. The scan originates entirely from the listing's own images, and
 * then feeds the same extraction pipeline as an officer's photo rather than a
 * parallel one. Records produced here are tagged E-commerce-Sourced, carry the
 * listing URL, and default to Compliance Status Pending like any other new scan.
 *
 * The failed listing models BRD R-03: a platform rate-limiting the fetch. It is
 * seeded deliberately, because "one listing failed and the rest of the batch carried
 * on" is a state the page has to render and is easy to forget to build.
 */

import type { EcommerceBatch, ScrapedListing, UploadedImage } from "@/types";

function listingImage(id: string, alt: string): UploadedImage {
  return {
    id: `${id}-img`,
    fileName: `${id}.jpg`,
    url: "/images/placeholder/ecommerce-listing.svg",
    sizeBytes: 421_000,
    angle: "front",
    altText: alt,
  };
}

export const MOCK_SINGLE_LISTING: ScrapedListing = {
  id: "lst-2001",
  listingUrl: "https://marketplace.example.in/listing/aravalli-bedsheet-set",
  title: "Aravalli Cotton Bedsheet Set, Double Bed, 210 TC",
  descriptionExcerpt:
    "100% cotton double bedsheet with two pillow covers. Machine washable. Sold by Aravalli Textiles Ltd.",
  images: [
    listingImage("lst-2001", "Product listing photograph of a folded cotton bedsheet set"),
  ],
  status: "done",
  recordId: "rec-1007",
};

export const MOCK_ECOMMERCE_BATCH: EcommerceBatch = {
  id: "batch-3001",
  sourceUrl: "https://marketplace.example.in/category/packaged-groceries?page=1",
  createdAt: "2026-09-05T08:10:00+05:30",
  listings: [
    {
      id: "lst-3001",
      listingUrl: "https://marketplace.example.in/listing/deccan-floor-cleaner-5l",
      title: "Deccan Floor Cleaner 5 L, Lemon",
      descriptionExcerpt:
        "Concentrated floor cleaner for daily use. 5 litre refill pack.",
      images: [
        listingImage("lst-3001", "Product listing photograph of a 5 litre floor cleaner bottle"),
      ],
      status: "done",
      recordId: "rec-1004",
    },
    {
      id: "lst-3002",
      listingUrl: "https://marketplace.example.in/listing/konkan-garam-masala-100g",
      title: "Konkan Garam Masala 100 g",
      descriptionExcerpt: "Traditional blend of whole spices, ground fresh.",
      images: [
        listingImage("lst-3002", "Product listing photograph of a garam masala pouch"),
      ],
      status: "scanning",
    },
    {
      id: "lst-3003",
      listingUrl: "https://marketplace.example.in/listing/ganga-iced-tea-250ml",
      title: "Ganga Iced Tea 250 ml, Pack of 6",
      descriptionExcerpt: "Ready to drink lemon iced tea, 250 ml cans, pack of six.",
      images: [
        listingImage("lst-3003", "Product listing photograph of a six-pack of iced tea cans"),
      ],
      status: "queued",
    },
    {
      id: "lst-3004",
      listingUrl: "https://marketplace.example.in/listing/nilgiri-face-wash-150ml",
      title: "Nilgiri Face Wash 150 ml",
      descriptionExcerpt: "Gentle daily face wash with neem and tulsi.",
      images: [
        listingImage("lst-3004", "Product listing photograph of a face wash tube"),
      ],
      status: "failed",
      failureReason:
        "The platform rate-limited this request. The rest of the batch was unaffected. Try this listing again in a few minutes.",
    },
  ],
};
