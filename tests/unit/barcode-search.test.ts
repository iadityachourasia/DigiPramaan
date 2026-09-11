import { describe, expect, it } from "vitest";

import { looksLikeBarcode } from "@/lib/api/records";

/**
 * Phase 8 — no new search UI control (matches Phase 7's own "zero new UI
 * controls" constraint): the existing free-text Records search box routes
 * an all-digit, real-barcode-length string to the new `barcode` search
 * param in addition to `query`. This tests that routing decision in
 * isolation, without a network call.
 */

describe("looksLikeBarcode", () => {
  it("accepts a real EAN-8 length", () => {
    expect(looksLikeBarcode("96385074")).toBe(true);
  });

  it("accepts a real EAN-13/UPC-A length", () => {
    expect(looksLikeBarcode("8901234567814")).toBe(true);
  });

  it("accepts a real GTIN-14 length", () => {
    expect(looksLikeBarcode("00012345678905")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(looksLikeBarcode("  8901234567814  ")).toBe(true);
  });

  it("rejects a product name search", () => {
    expect(looksLikeBarcode("Refined Groundnut Oil")).toBe(false);
  });

  it("rejects a short numeric string below any real symbology length", () => {
    expect(looksLikeBarcode("1234")).toBe(false);
  });

  it("rejects a too-long digit string", () => {
    expect(looksLikeBarcode("123456789012345")).toBe(false);
  });

  it("rejects digits mixed with letters", () => {
    expect(looksLikeBarcode("8901234567ABC")).toBe(false);
  });
});
