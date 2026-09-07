"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/shared";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useAuth, useComplianceRecord, usePermission } from "@/lib/hooks";
import type { DeclarationFieldId, ExtractedDeclaration } from "@/types";

import { ExtractionPanel } from "./ExtractionPanel";
import { ImageViewer } from "./ImageViewer";
import { SourceImageDrawer } from "./SourceImageDrawer";

export interface ExtractionViewProps {
  recordId: string;
}

type Angle = Extract<ExtractedDeclaration["sourceImageAngle"], "front" | "back" | "side_pdp">;

/**
 * ExtractionView — client orchestrator for Declaration Extraction &
 * Verification (page 4). Reads/mutates through `useComplianceRecord`
 * (server-authoritative — see scan-pipeline-store.ts) and composes the
 * two-panel layout (04-extraction-verification.md §2): `ImageViewer` on the
 * left, `ExtractionPanel` on the right, `SourceImageDrawer` for the
 * per-field "view source image" interaction.
 */
export function ExtractionView({ recordId }: ExtractionViewProps) {
  const t = useTranslations("extraction");
  const tScanSlots = useTranslations("scan.slots");
  const tVocab = useTranslations("vocabulary");
  const tDeclarationField = useTranslations("declarationField");
  const tCommon = useTranslations("common.actions");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const canVerify = usePermission("verification.confirm");
  const canFlag = usePermission("record.flagNeedsReview");

  const demoZeroDeclarations = searchParams.get("demo") === "zero-declarations";
  const {
    record,
    notFound,
    pending,
    blockedFields,
    mutationError,
    applyCorrection,
    verify,
    flagNeedsReview,
    retryOcr,
  } = useComplianceRecord(recordId, demoZeroDeclarations);

  const [activeAngle, setActiveAngle] = useState<Angle>("front");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAngle, setDrawerAngle] = useState<Angle>("front");
  const [reopened, setReopened] = useState(false);

  if (notFound) {
    return (
      <EmptyState icon="search_off" title={t("notFoundTitle")} description={t("notFoundBody")} />
    );
  }

  if (!record) {
    return (
      <div className="ux4g-upload-content" role="status">
        <span className="ux4g-spinner ux4g-spinner-sm" aria-hidden="true" />
      </div>
    );
  }

  const readOnly = record.verificationStatus === "Verified" && !reopened;
  const hasZeroDeclarations = record.extraction.declarations.every((d) => d.notDetected);
  const drawerImage = record.capturedImages.find((img) => img.angle === drawerAngle) ?? null;

  function angleLabel(angle: Angle): string {
    return tScanSlots(`${angle}.label`);
  }
  function engineLabel(engine: ExtractedDeclaration["sourceEngine"]): string {
    return t(`sourceEngine.${engine}`);
  }
  function confidenceLabel(band: ExtractedDeclaration["band"]): string {
    return tVocab(`confidenceBand.${band}`);
  }

  function handleViewImage(angle: ExtractedDeclaration["sourceImageAngle"]) {
    setDrawerAngle(angle);
    setActiveAngle(angle);
    setDrawerOpen(true);
  }

  function handleCorrect(fieldId: DeclarationFieldId, value: string) {
    if (!user) return;
    applyCorrection(fieldId, value, user.id);
  }

  async function handleVerify() {
    if (!user) return;
    const succeeded = await verify(user.id);
    /* `record` is guaranteed non-null here — this handler only exists after
     * the `!record` early return above — but a nested function declaration
     * isn't narrowed by TS across renders, hence the assertion. */
    if (succeeded) router.push(ROUTES.recordDetail(record!.id));
  }

  function handleFlag() {
    if (!user) return;
    flagNeedsReview(user.id);
  }

  return (
    <div className="lmcs-page-section">
      <div className="lmcs-extraction-status-row">
        <span
          className={`ux4g-tag-s ux4g-tag-${
            record.verificationStatus === "Verified" ? "tonal-success" : "tonal-info"
          }`}
        >
          <span className="ux4g-icon-outlined" aria-hidden="true">
            {record.verificationStatus === "Verified" ? "check_circle" : "schedule"}
          </span>
          <span className="ux4g-label-s-default">
            {tVocab(`verificationStatus.${record.verificationStatus}`)}
          </span>
        </span>

        {record.complianceScore ? (
          <span className="ux4g-body-s-default lmcs-extraction-score">
            {t("complianceScore.heading")}: {record.complianceScore.value}/100 ·{" "}
            {t(`complianceScore.band.${record.complianceScore.band}`)}
          </span>
        ) : null}
      </div>

      {readOnly ? (
        <Alert
          severity="info"
          title={t("readOnlyBanner.title")}
          actions={
            <button
              type="button"
              className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
              onClick={() => setReopened(true)}
            >
              {t("reopenToEdit")}
            </button>
          }
        >
          {t("readOnlyBanner.body")}
        </Alert>
      ) : null}

      {hasZeroDeclarations ? (
        <Alert severity="warning" title={t("zeroDeclarations.title")}>
          {t("zeroDeclarations.body")}
        </Alert>
      ) : null}

      {mutationError ? (
        <Alert severity="error" title={t("mutationError.title")}>
          {t("mutationError.body")}
        </Alert>
      ) : null}

      {blockedFields.length > 0 ? (
        <Alert severity="error" title={t("blocked.title")}>
          {t("blocked.body")}{" "}
          {blockedFields.map((fieldId) => tDeclarationField(fieldId)).join(", ")}
        </Alert>
      ) : null}

      <div className="lmcs-extraction-layout">
        <section aria-labelledby="image-heading">
          <h2 id="image-heading" className="ux4g-heading-m-strong ux4g-mb-m">
            {t("sourceImageHeading")}
          </h2>
          <ImageViewer
            images={record.capturedImages}
            activeAngle={activeAngle}
            onActiveAngleChange={setActiveAngle}
            labels={{ angle: angleLabel, zoomIn: t("zoomIn"), zoomOut: t("zoomOut") }}
          />
        </section>

        <section aria-labelledby="declarations-heading">
          <h2 id="declarations-heading" className="ux4g-heading-m-strong ux4g-mb-m">
            {t("declarationsHeading")}
          </h2>
          <ExtractionPanel
            record={record}
            readOnly={readOnly}
            onCorrect={handleCorrect}
            onViewImage={handleViewImage}
            labels={{
              overallConfidence: (percentage) => t("overallConfidence", { percentage }),
              fieldLabel: (fieldId) => tDeclarationField(fieldId),
              notDetected: t("notDetected"),
              corrected: t("corrected"),
              confidenceLabel,
              sourceAngleLabel: angleLabel,
              sourceEngineLabel: engineLabel,
              viewImage: t("viewImage"),
            }}
          />

          <div className="lmcs-extraction-actions">
            {hasZeroDeclarations ? (
              <button
                type="button"
                className="ux4g-btn ux4g-btn-outline-primary"
                onClick={() => user && retryOcr(user.id)}
                disabled={pending}
              >
                <span className="ux4g-icon-outlined" aria-hidden="true">
                  replay
                </span>
                {pending ? t("actions.retrying") : t("actions.retryOcr")}
              </button>
            ) : null}

            {!readOnly && canFlag ? (
              <button
                type="button"
                className="ux4g-btn ux4g-btn-outline-primary"
                onClick={handleFlag}
                disabled={pending}
              >
                <span className="ux4g-icon-outlined" aria-hidden="true">
                  flag
                </span>
                {pending ? t("actions.flagging") : t("actions.flagAsNeedsReview")}
              </button>
            ) : null}

            {!readOnly && canVerify ? (
              <button
                type="button"
                className="ux4g-btn ux4g-btn-primary"
                onClick={handleVerify}
                disabled={pending}
              >
                <span className="ux4g-icon-outlined" aria-hidden="true">
                  check_circle
                </span>
                {pending ? t("actions.confirming") : t("actions.confirmAndVerify")}
              </button>
            ) : null}
          </div>
        </section>
      </div>

      <SourceImageDrawer
        open={drawerOpen}
        image={drawerImage}
        angleLabel={angleLabel(drawerAngle)}
        onClose={() => setDrawerOpen(false)}
        labels={{ title: t("drawerTitle"), close: tCommon("close") }}
      />
    </div>
  );
}
