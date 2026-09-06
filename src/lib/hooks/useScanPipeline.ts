"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createScanPipeline, pollScanPipeline, retryPipelineStage } from "@/lib/api/scans";
import type { PipelineRun, PipelineStageId } from "@/types";

import { useAuth } from "./useAuth";

/*
 * Pipeline stages are seconds apart, driven by nothing but elapsed
 * server-side time (see scan-pipeline-store.ts) — no human latency to hide
 * behind, unlike Mobile Handoff's 2.5s cadence. At that interval the first
 * few stages would appear to batch-complete between polls, which directly
 * works against the one thing this page is meant to make visible: each
 * stage transition as its own moment.
 */
const POLL_INTERVAL_MS = 600;

function isPaused(run: PipelineRun): boolean {
  const ready = run.stages.find((s) => s.id === "readyForVerification");
  if (ready?.state === "completed") return true;
  return run.stages.some((s) => s.state === "failed");
}

export interface UseScanPipelineDemoOverride {
  forceFailStage?: PipelineStageId;
  fallbackOverride?: "used" | "skipped";
}

/**
 * useScanPipeline — the Processing Pipeline Tracker (03-scan-upload.md §2
 * Step 5). The run itself is normally already created by `createScan()` at
 * submit time (see scans.ts) — this hook just polls it. The one exception:
 * visiting this route directly with a `?demo=` override and no existing run
 * (a QA/testing convenience, not the real officer flow) auto-creates one
 * with placeholder metadata, so a specific stage's failure path is testable
 * without re-running the whole capture wizard first.
 */
export function useScanPipeline(scanId: string, demoOverride?: UseScanPipelineDemoOverride) {
  const { user } = useAuth();
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [notFound, setNotFound] = useState(false);

  /*
   * Read via refs inside the mount effect below rather than listed as
   * dependencies: `demoOverride` is a fresh object literal every render and
   * `user` resolves asynchronously after mount, so depending on either would
   * re-run the effect (and recreate the run) on renders that have nothing to
   * do with this one-time, once-off auto-create fallback.
   */
  const demoOverrideRef = useRef(demoOverride);
  const userIdRef = useRef(user?.id);
  useEffect(() => {
    demoOverrideRef.current = demoOverride;
    userIdRef.current = user?.id;
  }, [demoOverride, user?.id]);

  useEffect(() => {
    let cancelled = false;

    pollScanPipeline(scanId).then(async (result) => {
      if (cancelled) return;

      if (result.ok) {
        setRun(result.data);
        return;
      }

      const override = demoOverrideRef.current;
      if (!override) {
        setNotFound(true);
        return;
      }

      const created = await createScanPipeline({
        scanId,
        metadata: { category: "Other", region: "Delhi" },
        images: [],
        scannedByUserId: userIdRef.current ?? "demo",
        ...(override.forceFailStage ? { forceFailStage: override.forceFailStage } : {}),
        ...(override.fallbackOverride ? { fallbackOverride: override.fallbackOverride } : {}),
      });
      if (!cancelled) {
        if (created.ok) setRun(created.data);
        else setNotFound(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [scanId]);

  useEffect(() => {
    if (!run || isPaused(run)) return;

    const interval = setInterval(() => {
      pollScanPipeline(scanId).then((result) => {
        if (result.ok) setRun(result.data);
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [run, scanId]);

  const retry = useCallback(
    (stageId: PipelineStageId) => {
      retryPipelineStage(scanId, stageId).then((result) => {
        if (result.ok) setRun(result.data);
      });
    },
    [scanId]
  );

  return { run, notFound, retry };
}
