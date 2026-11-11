import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const hashNonce = (nonce: string) => createHash("sha256").update(nonce).digest("hex");
export const isNonce = (n: unknown): n is string => typeof n === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(n);
export const HANDOFF_TTL_MS = 10 * 60 * 1000;

/** httpOnly cookie on the browser that received the code. Confirming there releases the code to the app. */
export const CONFIRM_COOKIE = "doit-handoff";
export const newConfirmToken = () => randomBytes(32).toString("base64url");
export const hashToken = hashNonce;
