"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/shared";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { isPaused, useScanPipeline } from "@/lib/hooks";
import { PIPELINE_STAGE_IDS, type PipelineStageId, type SourceTag } from "@/types";

import { ScanPipelineTracker } from "./ScanPipelineTracker";
import { ScanProgressIndicator } from "./ScanProgressIndicator";
import { ScanSessionSummary } from "./ScanSessionSummary";
import { ScanStageHistory } from "./ScanStageHistory";

/** How long the terminal "Ready for verification" state waits before auto-navigating. */
const AUTO_NAVIGATE_DELAY_MS = 2500;

export interface ScanStatusViewProps {
  scanId: string;
}

/**
 * ScanStatusView — the Processing Pipeline Tracker (03-scan-upload.md §2
 * Step 5). Client component: polls server-side pipeline state via
 * `useScanPipeline` and reacts to it — see that hook and
 * scan-pipeline-store.ts for why this state lives server-side at all
 * (survives a closed tab, exactly like Mobile Handoff).
 */
export function ScanStatusView({ scanId }: ScanStatusViewProps) {
  const t = useTranslations("scan.pipeline");
  const tSource = useTranslations("vocabulary.sourceTag");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [navigated, setNavigated] = useState(false);

  /*
   * `?demo=pipeline-fail-<stage>` / `?demo=no-fallback` / `?demo=fallback-used`
   * on THIS route directly (not carried from the wizard) auto-creates a run
   * with that forced behaviour when none exists yet for this scan ID — a QA
   * convenience for testing one stage's failure path without re-running the
   * whole capture wizard first. The real flow never needs this: `createScan`
   * already created the run with the wizard's own `?demo=` value.
   */
  const demoParam = searchParams.get("demo");
  const forceFailStage = PIPELINE_STAGE_IDS.find(
    (stageId) => demoParam === `pipeline-fail-${stageId.replace(/([A-Z])/g, "-$1").toLowerCase()}`
  );
  const fallbackOverride =
    demoParam === "no-fallback" ? "skipped" : demoParam === "fallback-used" ? "used" : undefined;

  const { run, notFound, retry } = useScanPipeline(scanId, {
    ...(forceFailStage ? { forceFailStage } : {}),
    ...(fallbackOverride ? { fallbackOverride } : {}),
  });

  const readyStage = run?.stages.find((s) => s.id === "readyForVerification");
  const isReady = readyStage?.state === "completed";

  useEffect(() => {
    if (!isReady || !run || navigated) return;
    const timeout = setTimeout(() => {
      setNavigated(true);
      router.push(ROUTES.extraction(run.recordId));
    }, AUTO_NAVIGATE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [isReady, run, navigated, router]);

  if (notFound) {
    return <EmptyState icon="search_off" title={t("notFoundTitle")} description={t("notFoundBody")} />;
  }

  if (!run) {
    return (
      <div className="ux4g-upload-content" role="status">
        <span className="ux4g-spinner ux4g-spinner-sm" aria-hidden="true" />
      </div>
    );
  }

  const paused = isPaused(run);
  const stageLabel = (stageId: PipelineStageId) => t(`stages.${stageId}`);

  return (
    <div className="lmcs-page-section">
      <ScanSessionSummary
        run={run}
        paused={paused}
        labels={{
          sessionId: t("sessionId"),
          category: t("category"),
          region: t("region"),
          source: t("source"),
          elapsedLabel: t("elapsedLabel"),
          sourceValue: (source: SourceTag) => tSource(source),
        }}
      />

      <div className="lmcs-scan-status-main">
        <ScanPipelineTracker
          stages={run.stages}
          onRetry={(stageId: PipelineStageId) => retry(stageId)}
          labels={{
            stageLabel,
            skipped: t("skipped"),
            retry: t("retry"),
            pending: t("srPending"),
            inProgress: t("srInProgress"),
            completed: t("srCompleted"),
            failed: t("srFailed"),
          }}
        />

        <ScanProgressIndicator
          stages={run.stages}
          terminal={paused}
          labels={{
            progressLabel: t("progressLabel"),
            estimatedRemaining: (seconds) => t("estimatedRemaining", { seconds }),
            estimatedHint: t("estimatedHint"),
          }}
        />
      </div>

      <ScanStageHistory
        stages={run.stages}
        labels={{
          historyHeading: t("historyHeading"),
          showFullHistory: t("showFullHistory"),
          stageLabel,
          stageDuration: (seconds) => t("stageDuration", { seconds }),
          failed: t("srFailed"),
        }}
      />

      {isReady ? (
        <div className="ux4g-context-alert ux4g-alert-success">
          <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">check_circle</span>
          <div className="ux4g-alert-content">
            <span className="ux4g-alert-title">{t("readyTitle")}</span>
            <span className="ux4g-alert-message">{t("readyBody")}</span>
            <div className="ux4g-alert-actions">
              <button
                type="button"
                className="ux4g-btn ux4g-btn-primary ux4g-btn-sm"
                onClick={() => {
                  setNavigated(true);
                  router.push(ROUTES.extraction(run.recordId));
                }}
              >
                {t("reviewNow")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
