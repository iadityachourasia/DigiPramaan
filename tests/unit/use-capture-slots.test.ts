import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCaptureSlots } from "@/lib/hooks/useCaptureSlots";

/**
 * OP-Phase 1 — useCaptureSlots' real-mode upload-once intake (lazy draft
 * creation, one upload per accepted image, RECAPTURE_REQUIRED handling,
 * override) and mock-mode's unchanged checkImageQuality path, side by side.
 */

const isMockModeMock = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/lib/api/client", () => ({
  isMockMode: isMockModeMock,
}));

const createScanDraftMock = vi.hoisted(() => vi.fn());
const uploadCaptureImageMock = vi.hoisted(() => vi.fn());
const checkImageQualityMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/scans", () => ({
  createScanDraft: createScanDraftMock,
  uploadCaptureImage: uploadCaptureImageMock,
  checkImageQuality: checkImageQualityMock,
}));

function makeFile(name = "front.jpg"): File {
  return new File(["fake-bytes"], name, { type: "image/jpeg" });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("real mode — upload-once intake", () => {
  it("creates a scan draft lazily on the first accepted image, not before", async () => {
    isMockModeMock.mockReturnValue(false);
    createScanDraftMock.mockResolvedValue({ ok: true, data: { scanId: "scan-1" } });
    uploadCaptureImageMock.mockResolvedValue({ ok: true, data: { acceptanceState: "PASS" } });

    const { result } = renderHook(() => useCaptureSlots());
    expect(createScanDraftMock).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.submitImage("front", makeFile());
    });

    expect(createScanDraftMock).toHaveBeenCalledTimes(1);
    expect(uploadCaptureImageMock).toHaveBeenCalledWith("scan-1", "front", expect.any(File));
    expect(result.current.slots.front.status).toBe("passed");
    expect(result.current.draftScanId).toBe("scan-1");
  });

  it("reuses the same draft for a second image instead of creating another", async () => {
    isMockModeMock.mockReturnValue(false);
    createScanDraftMock.mockResolvedValue({ ok: true, data: { scanId: "scan-1" } });
    uploadCaptureImageMock.mockResolvedValue({ ok: true, data: { acceptanceState: "PASS" } });

    const { result } = renderHook(() => useCaptureSlots());
    await act(async () => {
      await result.current.submitImage("front", makeFile("front.jpg"));
    });
    await act(async () => {
      await result.current.submitImage("back", makeFile("back.jpg"));
    });

    expect(createScanDraftMock).toHaveBeenCalledTimes(1);
    expect(uploadCaptureImageMock).toHaveBeenCalledTimes(2);
  });

  it("a PASS_WITH_WARNINGS image lands in the review status, still counted as filled", async () => {
    isMockModeMock.mockReturnValue(false);
    createScanDraftMock.mockResolvedValue({ ok: true, data: { scanId: "scan-1" } });
    uploadCaptureImageMock.mockResolvedValue({
      ok: true,
      data: { acceptanceState: "PASS_WITH_WARNINGS" },
    });

    const { result } = renderHook(() => useCaptureSlots());
    await act(async () => {
      await result.current.submitImage("front", makeFile());
    });

    expect(result.current.slots.front.status).toBe("review");
    expect(result.current.slots.front.acceptanceState).toBe("PASS_WITH_WARNINGS");
  });

  it("a RECAPTURE_REQUIRED image is not persisted and marks the slot failed", async () => {
    isMockModeMock.mockReturnValue(false);
    createScanDraftMock.mockResolvedValue({ ok: true, data: { scanId: "scan-1" } });
    uploadCaptureImageMock.mockResolvedValue({
      ok: true,
      data: { acceptanceState: "RECAPTURE_REQUIRED", failureReason: "blur" },
    });

    const { result } = renderHook(() => useCaptureSlots());
    await act(async () => {
      await result.current.submitImage("front", makeFile());
    });

    expect(result.current.slots.front.status).toBe("failed");
    expect(result.current.slots.front.failureReason).toBe("blur");
    expect(result.current.canOverride("front")).toBe(true);
  });

  it("override resubmits the SAME retained file with a reason, landing as OVERRIDDEN", async () => {
    isMockModeMock.mockReturnValue(false);
    createScanDraftMock.mockResolvedValue({ ok: true, data: { scanId: "scan-1" } });
    uploadCaptureImageMock.mockResolvedValueOnce({
      ok: true,
      data: { acceptanceState: "RECAPTURE_REQUIRED", failureReason: "blur" },
    });
    uploadCaptureImageMock.mockResolvedValueOnce({
      ok: true,
      data: { acceptanceState: "OVERRIDDEN" },
    });

    const { result } = renderHook(() => useCaptureSlots());
    const file = makeFile("worn-label.jpg");
    await act(async () => {
      await result.current.submitImage("front", file);
    });
    expect(result.current.slots.front.status).toBe("failed");

    await act(async () => {
      await result.current.override("front", "Only photo obtainable, label is worn");
    });

    expect(uploadCaptureImageMock).toHaveBeenLastCalledWith(
      "scan-1",
      "front",
      file,
      "Only photo obtainable, label is worn"
    );
    expect(result.current.slots.front.status).toBe("passed");
    expect(result.current.canOverride("front")).toBe(false);
  });

  it("retake clears the retained file so override becomes a no-op", async () => {
    isMockModeMock.mockReturnValue(false);
    createScanDraftMock.mockResolvedValue({ ok: true, data: { scanId: "scan-1" } });
    uploadCaptureImageMock.mockResolvedValue({
      ok: true,
      data: { acceptanceState: "RECAPTURE_REQUIRED", failureReason: "blur" },
    });

    const { result } = renderHook(() => useCaptureSlots());
    await act(async () => {
      await result.current.submitImage("front", makeFile());
    });
    expect(result.current.canOverride("front")).toBe(true);

    act(() => {
      result.current.retake("front");
    });
    expect(result.current.slots.front.status).toBe("empty");
    expect(result.current.canOverride("front")).toBe(false);

    const resolved = await result.current.override("front", "irrelevant now");
    expect(resolved).toBe(false);
  });
});

describe("mock mode — unchanged checkImageQuality flow", () => {
  it("never calls the real draft/upload endpoints", async () => {
    isMockModeMock.mockReturnValue(true);
    checkImageQualityMock.mockResolvedValue({ ok: true, data: { passed: true } });

    const { result } = renderHook(() => useCaptureSlots());
    await act(async () => {
      await result.current.submitImage("front", makeFile());
    });

    expect(checkImageQualityMock).toHaveBeenCalledTimes(1);
    expect(createScanDraftMock).not.toHaveBeenCalled();
    expect(uploadCaptureImageMock).not.toHaveBeenCalled();
    expect(result.current.slots.front.status).toBe("passed");
    expect(result.current.draftScanId).toBeNull();
  });
});
