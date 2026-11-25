"use client";

import { useSyncExternalStore } from "react";
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

export interface CreateDraft {
  look: PactLook;
  draft: RuleDraft;
  offset: number;
}
export const saveCreateDraft = (d: CreateDraft | null) => put(DRAFT, d);
export function useCreateDraft(on: boolean) {
  const raw = useSyncExternalStore(never, () => get(DRAFT), () => null);
  return on ? parse<CreateDraft>(raw) : null;
}
