import type { Domain } from "./types";

/** Explore's eight domains, drawn as the lanes of a track. */
export interface ExploreLane {
  id: string;
  n: number;
  name: string;
  tag: string;
  bg: string;
  ink: string;
  domains: Domain[];
}

export const EXPLORE_LANES: ExploreLane[] = [
  { id: "body", n: 1, name: "Body", tag: "Stronger, faster, looser", bg: "var(--color-ember)", ink: "#ffffff", domains: ["strong", "move", "bend"] },
  { id: "rest", n: 2, name: "Food and sleep", tag: "The quiet basics", bg: "var(--color-mint)", ink: "#ffffff", domains: ["food", "sleep"] },
  { id: "calm", n: 3, name: "Calm", tag: "Slow down on purpose", bg: "var(--color-ice)", ink: "var(--color-ink)", domains: ["calm"] },
  { id: "head", n: 4, name: "Learn and focus", tag: "Read, study, get it done", bg: "var(--color-blue)", ink: "#ffffff", domains: ["learn", "focus"] },
  { id: "make", n: 5, name: "Make things", tag: "Draw, write, play, film", bg: "var(--color-rose)", ink: "#ffffff", domains: ["make"] },
  { id: "people", n: 6, name: "People and faith", tag: "Closer to each other", bg: "#ffb81f", ink: "var(--color-ink)", domains: ["people", "faith"] },
  { id: "home", n: 7, name: "Home and money", tag: "Tidy rooms, tidy accounts", bg: "var(--color-violet)", ink: "#ffffff", domains: ["home", "money"] },
  { id: "break", n: 8, name: "Break a habit", tag: "Stop, or cut down", bg: "var(--color-ink)", ink: "#ffffff", domains: ["screens", "cravings", "spending", "little-things"] },
];

export const DOMAIN_NAMES: Record<Domain, string> = {
  strong: "Get strong",
  move: "Run, walk, ride",
  bend: "Stretch",
  food: "Food",
  sleep: "Sleep",
  calm: "Calm",
  learn: "Learn",
  focus: "Focus",
  make: "Make",
  people: "People",
  faith: "Faith and giving",
  home: "Home",
  money: "Money",
  screens: "Screens",
  cravings: "Food, drink, smoke",
  spending: "Spending",
  "little-things": "Little things",
};

export function laneOf(domain: Domain) {
  return EXPLORE_LANES.find((l) => l.domains.includes(domain))!;
}
