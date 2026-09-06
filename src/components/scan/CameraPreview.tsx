"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * CameraPreview — live camera feed + capture button, shared by the desktop
 * "Use this device's camera" mode (CaptureSlot) and the Mobile Capture
 * Companion (MobileCaptureView). Requests the camera only once mounted, and
 * releases the stream on unmount — never held open longer than the one slot
 * actively using it.
 */

export interface CameraPreviewProps {
  captureLabel: string;
  cameraDeniedMessage: string;
  onCapture: (file: File) => void;
}

export function CameraPreview({
  captureLabel,
  cameraDeniedMessage,
  onCapture,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      })
      .catch(() => {
        setError(true);
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }, [onCapture]);

  if (error) {
    return (
      <p className="ux4g-upload-error-msg">
        <span className="ux4g-icon-outlined" aria-hidden="true">error</span>
        {cameraDeniedMessage}
      </p>
    );
  }

  return (
    <div className="lmcs-capture-slot-camera">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Live camera preview"
        className="lmcs-capture-slot-video"
      />
      <button
        type="button"
        className="ux4g-btn ux4g-btn-primary ux4g-btn-lg lmcs-capture-slot-shutter"
        onClick={capture}
        disabled={!ready}
      >
        <span className="ux4g-icon-outlined" aria-hidden="true">photo_camera</span>
        {captureLabel}
      </button>
    </div>
  );
}
