import { describe, expect, it } from "vitest";
import { isOld, MAX_OPEN_AGE_MS, retryDelay } from "./fresh";

const now = 1_800_000_000_000;
const opened = { stamp: now - 800, shown: null, opening: true, restored: false, now };

describe("isOld", () => {
  it("trusts a page that just came from the server", () => {
    expect(isOld(opened)).toBe(false);
  });
  it("catches a saved copy by its age", () => {
    expect(isOld({ ...opened, stamp: now - MAX_OPEN_AGE_MS - 1 })).toBe(true);
  });
  it("catches a copy the browser says it put back, however recent", () => {
    expect(isOld({ ...opened, restored: true })).toBe(true);
  });
  it("checks a page from the future too: the device's clock is behind", () => {
    expect(isOld({ ...opened, stamp: now + 3_600_000 })).toBe(true);
  });
  it("catches a kept screen that comes back with the data it already showed", () => {
    expect(isOld({ ...opened, opening: false, shown: opened.stamp })).toBe(true);
  });
  it("never loops on a wrong clock: new data after opening is always fine", () => {
    expect(isOld({ ...opened, opening: false, shown: now - 900_000, stamp: now - 890_000 })).toBe(false);
  });
});

describe("retryDelay", () => {
  it("backs off, then keeps trying at the same pace", () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(retryDelay)).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 15_000, 15_000]);
  });
});
