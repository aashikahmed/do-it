import { describe, expect, it } from "vitest";
import { breakTitle, inviteText, pactName } from "./view";

describe("breakTitle", () => {
  it("says No for none at all, Less otherwise", () => {
    expect(breakTitle("Soda", "none")).toBe("No soda");
    expect(breakTitle("Coffee", "amount")).toBe("Less coffee");
    expect(breakTitle("Takeout", "days")).toBe("Less takeout");
    expect(breakTitle("TikTok", "none")).toBe("No TikTok");
  });
  it("is empty without a subject", () => {
    expect(breakTitle("  ", "none")).toBe("");
  });
});

describe("pactName", () => {
  it("uses the title for either kind", () => {
    expect(pactName({ kind: "build", title: " Push-ups " })).toBe("Push-ups");
    expect(pactName({ kind: "break", title: "No soda", subject: "soda" })).toBe("No soda");
  });
  it("names a break pact from its subject when there's no title", () => {
    expect(pactName({ kind: "break", title: "", subject: "soda", cadence: "daily", measure: "none" })).toBe("No soda");
    expect(pactName({ kind: "break", title: null, subject: "coffee", cadence: "daily", measure: "count" })).toBe("Less coffee");
    expect(pactName({ kind: "break", subject: "takeout", cadence: "weekly", measure: "none" })).toBe("Less takeout");
  });
  it("is empty only when there's nothing to go on", () => {
    expect(pactName({ kind: "build", title: "" })).toBe("");
    expect(pactName({ kind: "break", title: "", subject: null })).toBe("");
  });
});

describe("inviteText", () => {
  it("quotes a build pact's name", () => {
    expect(inviteText({ kind: "build", title: "Push-ups", emoji: "💪" })).toBe(`💪 Do "Push-ups" with me. Let's not break the chain.`);
  });
  it("says what a break pact gives up", () => {
    expect(inviteText({ kind: "break", title: "No soda", subject: "soda", emoji: "🥤", cadence: "daily", measure: "none" })).toBe(
      "🥤 Give up soda with me. Let's not break the chain.",
    );
    expect(inviteText({ kind: "break", title: "Less coffee", subject: "coffee", emoji: "☕", cadence: "daily", measure: "count" })).toBe(
      "☕ Cut down on coffee with me. Let's not break the chain.",
    );
    expect(inviteText({ kind: "break", title: "Less takeout", subject: "takeout", emoji: "🥡", cadence: "weekly", measure: "none" })).toBe(
      "🥡 Cut down on takeout with me. Let's not break the chain.",
    );
  });
  it("falls back to the title when a break pact has no subject", () => {
    expect(inviteText({ kind: "break", title: "No soda", subject: null, emoji: "🥤" })).toBe(`🥤 Do "No soda" with me. Let's not break the chain.`);
  });
  it("never leaves empty quotes", () => {
    const empty = [
      { kind: "build" as const, title: "", emoji: "🔥" },
      { kind: "break" as const, title: "", subject: "", emoji: "🔥" },
      { kind: "break" as const, title: "   ", subject: null, emoji: "🔥" },
    ];
    for (const p of empty) {
      const text = inviteText(p);
      expect(text).not.toContain('""');
      expect(text).toBe("🔥 Join my pact. Let's not break the chain.");
    }
    expect(inviteText({ title: "", emoji: "" })).toBe("Join my pact. Let's not break the chain.");
  });
});
