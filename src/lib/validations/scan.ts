import { z } from "zod";

import { PRODUCT_CATEGORIES } from "@/types";

/**
 * Scan/Upload metadata form validation (03-scan-upload.md §2, Step 4).
 *
 * Messages are injected, matching the pattern in validations/login.ts — every
 * user-visible string lives in src/messages, never hard-coded in a schema.
 */

export interface ScanMetadataMessages {
  categoryRequired: string;
  regionRequired: string;
  ecommerceUrlInvalid: string;
  productNameTooLong: string;
}

/** Long enough for a real retail product title, short enough to stay one table cell. */
export const PRODUCT_NAME_MAX_LENGTH = 120;

export function scanMetadataSchema(messages: ScanMetadataMessages) {
  return z.object({
    category: z.enum(PRODUCT_CATEGORIES, { message: messages.categoryRequired }),
    /*
     * Optional by design. An officer photographing a shelf in the field must
     * not be blocked by a text field, and the e-commerce intake path (page 8)
     * fills this automatically from the listing title. When it's left blank
     * `buildFinalRecord` falls back to "{manufacturer} — {category}".
     */
    productName: z
      .string()
      .trim()
      .max(PRODUCT_NAME_MAX_LENGTH, { message: messages.productNameTooLong })
      .optional(),
    manufacturerName: z.string().trim().optional(),
    region: z.string().trim().min(1, { message: messages.regionRequired }),
    ecommerceListingUrl: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || z.string().url().safeParse(value).success, {
        message: messages.ecommerceUrlInvalid,
      }),
  });
}

export type ScanMetadataFormValues = z.infer<ReturnType<typeof scanMetadataSchema>>;
