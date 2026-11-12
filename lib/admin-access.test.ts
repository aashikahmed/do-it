import { describe, expect, it } from "vitest";
import { adminEmails, isAdminEmail } from "./admin-access";

describe("admin access", () => {
  it("lets in only the listed emails, ignoring case and spaces", () => {
    const raw = " Owner@Example.com , second@example.com";
    expect(isAdminEmail("owner@example.com", raw)).toBe(true);
    expect(isAdminEmail("OWNER@example.COM ", raw)).toBe(true);
    expect(isAdminEmail("second@example.com", raw)).toBe(true);
    expect(isAdminEmail("someone@example.com", raw)).toBe(false);
  });

  it("lets nobody in when the setting is missing or empty", () => {
    expect(adminEmails("").size).toBe(0);
    expect(adminEmails(" , ,").size).toBe(0);
    expect(isAdminEmail("owner@example.com", "")).toBe(false);
    expect(isAdminEmail("", "")).toBe(false);
  });

  it("never matches a missing or non-string email", () => {
    const raw = "owner@example.com";
    expect(isAdminEmail(undefined, raw)).toBe(false);
    expect(isAdminEmail(null, raw)).toBe(false);
    expect(isAdminEmail("", raw)).toBe(false);
    expect(isAdminEmail(["owner@example.com"], raw)).toBe(false);
  });

  it("doesn't match partial addresses", () => {
    const raw = "owner@example.com";
    expect(isAdminEmail("owner@example.co", raw)).toBe(false);
    expect(isAdminEmail("xowner@example.com", raw)).toBe(false);
    expect(isAdminEmail("owner@example.com.evil.test", raw)).toBe(false);
  });
});
