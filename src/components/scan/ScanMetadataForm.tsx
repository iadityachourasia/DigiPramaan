"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";

import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { MOCK_MANUFACTURERS, INSPECTION_REGIONS } from "@/lib/mock";
import {
  scanMetadataSchema,
  type ScanMetadataFormValues,
} from "@/lib/validations/scan";
import { PRODUCT_CATEGORIES, type ScanMetadata } from "@/types";

/**
 * ScanMetadataForm — Step 4 of the Scan Capture Wizard (03-scan-upload.md §2).
 *
 * Manufacturer's "optional autocomplete text" is a native `<datalist>` bound
 * to the already-existing `MOCK_MANUFACTURERS` list — a real autocomplete
 * affordance without building a second bespoke combobox widget alongside
 * `ui/Select`; the option set is short and free typing must stay allowed
 * (an officer can be scanning a manufacturer not yet in the list).
 */

export interface ScanMetadataFormProps {
  onSubmit: (values: ScanMetadata) => void;
  labels: {
    heading: string;
    productNameLabel: string;
    productNameHint: string;
    productNameTooLong: string;
    categoryLabel: string;
    categoryRequired: string;
    manufacturerLabel: string;
    manufacturerHint: string;
    regionLabel: string;
    regionRequired: string;
    ecommerceUrlLabel: string;
    ecommerceUrlCaption: string;
    ecommerceUrlHint: string;
    ecommerceUrlInvalid: string;
    categoryOptionLabel: (category: string) => string;
  };
  formId: string;
  /**
   * Seeds the form once at mount — the Compliance Records "Re-scan" row
   * action (05-compliance-records.md §2) carries a prior record's
   * category/manufacturer/region as URL params, and this is the only way
   * "pre-filled" can mean anything given `ScanMetadata` has no other
   * pre-fillable fields.
   */
  defaultValues?: Partial<ScanMetadataFormValues>;
}

export function ScanMetadataForm({ onSubmit, labels, formId, defaultValues }: ScanMetadataFormProps) {
  const manufacturerListId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ScanMetadataFormValues>({
    resolver: zodResolver(
      scanMetadataSchema({
        categoryRequired: labels.categoryRequired,
        regionRequired: labels.regionRequired,
        ecommerceUrlInvalid: labels.ecommerceUrlInvalid,
        productNameTooLong: labels.productNameTooLong,
      })
    ),
    ...(defaultValues ? { defaultValues } : {}),
  });

  const submit = handleSubmit((values) => {
    onSubmit({
      category: values.category,
      region: values.region,
      ...(values.productName ? { productName: values.productName } : {}),
      ...(values.manufacturerName ? { manufacturerName: values.manufacturerName } : {}),
      ...(values.ecommerceListingUrl
        ? { ecommerceListingUrl: values.ecommerceListingUrl }
        : {}),
    });
  });

  return (
    <form id={formId} onSubmit={submit} className="lmcs-form-grid" noValidate>
      <h2 className="ux4g-title-m-strong">{labels.heading}</h2>

      <TextField
        id="scan-product-name"
        label={labels.productNameLabel}
        hint={labels.productNameHint}
        {...(errors.productName?.message ? { error: errors.productName.message } : {})}
        {...register("productName")}
      />

      <Select
        id="scan-category"
        label={labels.categoryLabel}
        options={PRODUCT_CATEGORIES.map((category) => ({
          label: labels.categoryOptionLabel(category),
          value: category,
        }))}
        {...(errors.category?.message ? { error: errors.category.message } : {})}
        {...register("category")}
      />

      <div>
        <TextField
          id="scan-manufacturer"
          label={labels.manufacturerLabel}
          hint={labels.manufacturerHint}
          list={manufacturerListId}
          {...register("manufacturerName")}
        />
        <datalist id={manufacturerListId}>
          {MOCK_MANUFACTURERS.map((manufacturer) => (
            <option key={manufacturer.id} value={manufacturer.name}>
              {manufacturer.name}
            </option>
          ))}
        </datalist>
      </div>

      <Select
        id="scan-region"
        label={labels.regionLabel}
        options={INSPECTION_REGIONS.map((region) => ({ label: region, value: region }))}
        {...(errors.region?.message ? { error: errors.region.message } : {})}
        {...register("region")}
      />

      <TextField
        id="scan-ecommerce-url"
        label={labels.ecommerceUrlLabel}
        hint={labels.ecommerceUrlHint}
        {...(errors.ecommerceListingUrl?.message
          ? { error: errors.ecommerceListingUrl.message }
          : {})}
        placeholder={labels.ecommerceUrlHint}
        {...register("ecommerceListingUrl")}
      />
      <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
        {labels.ecommerceUrlCaption}
      </p>
    </form>
  );
}
