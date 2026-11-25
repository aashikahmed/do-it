import { describe, expect, it } from "vitest";
import type { Member, Pact, PactBundle } from "./data";
import { canSetNumber, numberOf, numbersDiffer, numberText, withOwnNumber } from "./own-number";

const pact = { kind: "build", measure: "count", unit: "pages", direction: "up", target: 5 } as Pact;
const member = (id: string, target: number | null = null) => ({ user_id: id, target }) as Member;
const bundle = (over: Partial<PactBundle> = {}) =>
  ({ pact, members: [member("a"), member("b", 20)], checkins: [], changes: [], state: { phase: "active" }, ...over }) as unknown as PactBundle;

describe("your own number", () => {
  it("is the pact's until you set one, and 0 is any amount", () => {
    expect(numberOf(pact, member("a"))).toBe(5);
    expect(numberOf(pact, member("a", 20))).toBe(20);
    expect(numberOf(pact, member("a", 0))).toBeNull();
    expect(numberOf(pact, undefined)).toBe(5);
  });
  it("never applies to break pacts or pacts with nothing to measure", () => {
    expect(numberOf({ ...pact, kind: "break" }, member("a", 20))).toBe(5);
    expect(numberOf({ ...pact, measure: "none", target: null }, member("a", 20))).toBeNull();
  });
  it("is what the person sees, and leaves the pact alone for everyone else", () => {
    const b = bundle();
    expect(withOwnNumber(b, "b").pact.target).toBe(20);
    expect(withOwnNumber(b, "a")).toBe(b);
    expect(b.pact.target).toBe(5);
  });
  it("can be set until your own first check-in", () => {
    expect(canSetNumber(bundle(), "a")).toBe(true);
    expect(canSetNumber(bundle({ checkins: [{ user_id: "b" }] as PactBundle["checkins"] }), "a")).toBe(true);
    expect(canSetNumber(bundle({ checkins: [{ user_id: "a" }] as PactBundle["checkins"] }), "a")).toBe(false);
    expect(canSetNumber(bundle({ changes: [{ user_id: "a" }] as PactBundle["changes"] }), "a")).toBe(false);
    expect(canSetNumber(bundle({ state: { phase: "ended" } as PactBundle["state"] }), "a")).toBe(false);
    expect(canSetNumber(bundle(), "someone else")).toBe(false);
  });
  it("is worded plainly", () => {
    expect(numberText(pact, 1)).toBe("1 page");
    expect(numberText(pact, null)).toBe("any amount");
    expect(numberText({ measure: "time", unit: null, direction: "down" }, 2100)).toBe("under 35:00");
  });
  it("shows next to names only when they differ", () => {
    expect(numbersDiffer(bundle())).toBe(true);
    expect(numbersDiffer(bundle({ members: [member("a"), member("b")] }))).toBe(false);
    expect(numbersDiffer(bundle({ members: [member("a"), member("b", 5)] }))).toBe(false);
  });
});
