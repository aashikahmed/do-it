"use client";

import { useState, useSyncExternalStore } from "react";
import type { RuleDraft } from "../edit";
import type { PactLook } from "../pact-input";
import type { Level } from "./types";

// Two things carried to another page and back, in this tab only:
// what someone had set on an idea when they were asked to sign in, and an idea opened in the full create flow.

const PENDING = "doit.explore-pending";
const DRAFT = "doit.explore-draft";
const never = () => () => {};

function get(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function put(key: string, v: unknown) {
  try {
    if (v === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(v));
  } catch {}
}
function parse<T>(raw: string | null): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * What was handed over, for as long as this visit lasts. Creating the pact clears it from storage and refreshes the
 * screen: without this the screen would start over instead of showing "Now bring someone in".
 */
export function useHeld<T>(now: T | null) {
  const [held, setHeld] = useState(now);
  // null on the server and while hydrating, so it can arrive a moment later
  if (now !== null && held === null) setHeld(now);
  return held ?? now;
}

export interface Pending {
  id: string;
  level: Level;
  draft: RuleDraft;
  offset: number;
  plan: string;
}
export const savePending = (p: Pending | null) => put(PENDING, p);
/** Null on the server and while hydrating, then whatever was waiting. */
export function usePending(id: string) {
  const p = parse<Pending>(useSyncExternalStore(never, () => get(PENDING), () => null));
  return p?.id === id ? p : null;
}

/** The "ask a friend to choose" link this page was opened from (?ask=…). Read in the browser so the page stays static. */
export function useAskCode() {
  const search = useSyncExternalStore(never, () => window.location.search, () => "");
  const code = new URLSearchParams(search).get("ask");
  return code && /^[a-z0-9]{4,32}$/i.test(code) ? code : null;
}

export interface CreateDraft {
  look: PactLook;
  draft: RuleDraft;
  offset: number;
  /** the "ask a friend" link it answers */
  ask: string | null;
}
export const saveCreateDraft = (d: CreateDraft | null) => put(DRAFT, d);
export function useCreateDraft(on: boolean) {
  const raw = useSyncExternalStore(never, () => get(DRAFT), () => null);
  return on ? parse<CreateDraft>(raw) : null;
}
