"use client";

import { useSyncExternalStore } from "react";

// Saved ideas live on the device: a bookmark, not part of anyone's account.
const KEY = "doit.saved-ideas";
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
}

/** Ids of the saved ideas, newest first. Empty until the page has hydrated. */
export function useSaved() {
  return parse(useSyncExternalStore(subscribe, read, () => "[]"));
}

/** Saves it, or takes it off. Returns whether it's saved now. */
export function toggleSaved(id: string) {
  const ids = parse(read());
  const on = !ids.includes(id);
  try {
    localStorage.setItem(KEY, JSON.stringify(on ? [id, ...ids] : ids.filter((x) => x !== id)));
  } catch {
    return false;
  }
  listeners.forEach((l) => l());
  return on;
}
