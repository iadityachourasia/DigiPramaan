"use client";

import { useEffect, useState } from "react";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Ticking `mm:ss` elapsed-time string, driven off a real ISO `createdAt` —
 * stops ticking once `paused` is true (the run reached a terminal state),
 * so the clock freezes on the actual final duration instead of drifting
 * past it.
 */
export function useElapsedTime(createdAt: string | null, paused: boolean): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!createdAt || paused) return;

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [createdAt, paused]);

  if (!createdAt) return null;

  const elapsedMs = now - new Date(createdAt).getTime();
  return formatElapsed(elapsedMs);
}
