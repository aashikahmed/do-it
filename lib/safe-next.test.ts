import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/p/123")).toBe("/p/123");
    expect(safeNext("/j/abc?x=1#top")).toBe("/j/abc?x=1#top");
  });

  it("falls back for missing or relative values", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("p/123")).toBe("/");
    expect(safeNext("https://evil.example/")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });

  it("blocks paths a browser would read as another site", () => {
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/\\/evil.example")).toBe("/");
    expect(safeNext("/\t/evil.example")).toBe("/");
    expect(safeNext("/\n/evil.example")).toBe("/");
  });

  it("uses the given fallback", () => {
    expect(safeNext("//evil.example", "/me")).toBe("/me");
  });
});
