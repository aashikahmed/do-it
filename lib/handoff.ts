import "server-only";
import { createHash } from "node:crypto";

export const hashNonce = (nonce: string) => createHash("sha256").update(nonce).digest("hex");
export const isNonce = (n: unknown): n is string => typeof n === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(n);
export const HANDOFF_TTL_MS = 10 * 60 * 1000;
