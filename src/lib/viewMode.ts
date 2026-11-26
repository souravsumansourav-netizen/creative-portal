"use client";
import { useSyncExternalStore } from "react";

/** Admins can browse as "admin" (everything) or "reviewer" (only the reviewer's screens). Per browser tab, cleared on sign-out. */
export type ViewMode = "admin" | "reviewer";
const KEY = "portal-view-mode";
const listeners = new Set<() => void>();

export function getViewMode(): ViewMode | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === "admin" || v === "reviewer" ? v : null;
  } catch { return null; }
}

export function setViewMode(mode: ViewMode | null) {
  try { mode ? sessionStorage.setItem(KEY, mode) : sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

export function useViewMode(): ViewMode | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getViewMode,
    () => null,
  );
}

/** Screens a reviewer may open (everything an approver can see, plus the shot detail page). */
export const REVIEWER_PATHS = ["/triage", "/intelligence", "/review", "/rework", "/library", "/routing", "/dashboard", "/shots"];
