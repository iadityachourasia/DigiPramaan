"use client";

import { useSyncExternalStore } from "react";

import { THEME_STORAGE_KEY } from "@/lib/theme-constants";

export type Theme = "light" | "dark";

const CHANGE_EVENT = "digi-pramaan-theme-change";
let pageChoice: Theme | null = null;

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : pageChoice;
  } catch {
    return pageChoice;
  }
}

function preferredTheme(): Theme {
  return savedTheme() ?? "light";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.dataset.theme = theme;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function syncTheme(): void {
  applyTheme(preferredTheme());
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    pageChoice = null;
  } catch {
    // Keep a manual choice for this page when storage is unavailable.
    pageChoice = theme;
  }
  applyTheme(theme);
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function observeThemePreferences(): () => void {
  const onStorageChange = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      pageChoice = null;
      syncTheme();
    }
  };

  window.addEventListener("storage", onStorageChange);
  syncTheme();

  return () => {
    window.removeEventListener("storage", onStorageChange);
  };
}
