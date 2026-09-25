import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useElapsedTime } from "@/lib/hooks/useElapsedTime";

describe("useElapsedTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when createdAt is null", () => {
    const { result } = renderHook(() => useElapsedTime(null, false));
    expect(result.current).toBeNull();
  });

  it("ticks mm:ss upward from a real createdAt while unpaused", () => {
    const createdAt = new Date(Date.now() - 5_000).toISOString();
    const { result } = renderHook(() => useElapsedTime(createdAt, false));

    expect(result.current).toBe("0:05");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current).toBe("0:15");
  });

  it("freezes once paused — no further ticking", () => {
    const createdAt = new Date(Date.now() - 5_000).toISOString();
    const { result, rerender } = renderHook(
      ({ paused }) => useElapsedTime(createdAt, paused),
      { initialProps: { paused: false } }
    );

    expect(result.current).toBe("0:05");

    rerender({ paused: true });
    const frozenValue = result.current;

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current).toBe(frozenValue);
  });
});
