import { describe, expect, it } from "vitest";
import { oval } from "./oval";

const T = oval(160, 100, 60);
const IN = 49;
const OUT = 91;
const REF = 70;
const angle = ([x, y]: [number, number], cx: number) => Math.atan2(y - 100, x - cx);

describe("oval", () => {
  it("starts and finishes every lane on the same line", () => {
    for (const R of [IN, OUT]) {
      expect(T.at(0, R, REF)).toBe(0);
      expect(T.at(1, R, REF)).toBeCloseTo(T.length(R));
      expect(T.pt(0, R)[0]).toBeCloseTo(T.pt(0, IN)[0]);
    }
  });

  it("puts people at the same point of the pact side by side", () => {
    for (let k = 0; k <= 40; k++) {
      const u = k / 40;
      const a = T.pt(T.at(u, IN, REF), IN);
      const b = T.pt(T.at(u, OUT, REF), OUT);
      const onBend = Math.abs(a[0] - 160) > 60.01 || Math.abs(b[0] - 160) > 60.01;
      if (onBend) {
        const cx = a[0] > 160 ? 220 : 100;
        expect(angle(a, cx)).toBeCloseTo(angle(b, cx));
      } else expect(a[0]).toBeCloseTo(b[0]);
    }
  });

  it("keeps moving forward", () => {
    let last = -1;
    for (let k = 0; k <= 100; k++) {
      const s = T.at(k / 100, OUT, REF);
      expect(s).toBeGreaterThan(last);
      last = s;
    }
  });
});
