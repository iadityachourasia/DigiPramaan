"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { DISPLAY_SIZE_STORAGE_KEY } from "@/lib/display-size-constants";

const sizes = ["default", "large", "larger"] as const;
type DisplaySize = (typeof sizes)[number];
const CHANGE_EVENT = "digi-pramaan-display-size-change";

function applyDisplaySize(next: DisplaySize) {
  document.documentElement.dataset.displaySize = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function readDisplaySize(): DisplaySize {
  const value = document.documentElement.dataset.displaySize;
  return sizes.includes(value as DisplaySize) ? (value as DisplaySize) : "default";
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

function restoreDisplaySize() {
  try {
    const saved = localStorage.getItem(DISPLAY_SIZE_STORAGE_KEY);
    if (sizes.includes(saved as DisplaySize)) applyDisplaySize(saved as DisplaySize);
  } catch {
    // Browsers can deny storage; the current page still supports the control.
  }
}

function chooseDisplaySize(next: DisplaySize) {
  applyDisplaySize(next);
  try {
    localStorage.setItem(DISPLAY_SIZE_STORAGE_KEY, next);
  } catch {
    // Keep the choice for this page.
  }
}

export function DisplaySizeControl() {
  const t = useTranslations("accessibility");
  const size = useSyncExternalStore(subscribe, readDisplaySize, () => "default");

  useEffect(() => {
    restoreDisplaySize();
  }, []);

  return (
    <div className="lmcs-display-size" role="group" aria-label={t("displaySize")}>
      {sizes.map((option, index) => (
        <button
          key={option}
          type="button"
          className="ux4g-topbar__iconbtn lmcs-display-size-button"
          aria-label={t(`displaySize${index}`)}
          aria-pressed={size === option}
          onClick={() => chooseDisplaySize(option)}
        >
          {index === 0 ? "A" : index === 1 ? "A+" : "A++"}
        </button>
      ))}
    </div>
  );
}
