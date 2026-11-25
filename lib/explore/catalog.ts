import { IDEAS } from "./ideas";
import type { Idea, IdeaCard } from "./types";
import { fromText } from "./words";

export function slugOf(idea: Idea) {
  return idea.slug ?? idea.id;
}

export function ideaBySlug(slug: string): Idea | undefined {
  return IDEAS.find((i) => slugOf(i) === slug);
}

export function ideaById(id: string): Idea | undefined {
  return IDEAS.find((i) => i.id === id);
}

export function cardOf(i: Idea): IdeaCard {
  return {
    id: i.id,
    slug: slugOf(i),
    kind: i.kind,
    title: i.title,
    subject: i.kind === "break" ? i.subject : "",
    emoji: i.emoji,
    color: i.color,
    domain: i.domain,
    line: i.line,
    from: fromText(i),
    minutes: i.minutes,
    when: i.when,
    place: i.place,
    noKit: i.needs.length === 0 && i.cost === "free",
    goodWith: i.goodWith,
    tags: i.tags,
    synonyms: i.synonyms,
  };
}

export function allCards(): IdeaCard[] {
  return IDEAS.map(cardOf);
}

/** Ideas for this week, the same for everyone: something short for the body or the mind, something to make or do, and a habit to break. */
export function threeFor(seed: number): IdeaCard[] {
  const short = IDEAS.filter((i) => ["strong", "move", "bend", "food", "sleep", "calm"].includes(i.domain) && i.minutes <= 10);
  const doing = IDEAS.filter((i) => ["learn", "focus", "make", "people", "faith", "home", "money"].includes(i.domain));
  // never suggest giving up drink, food or smoking out of the blue
  const breaking = IDEAS.filter((i) => i.kind === "break" && i.domain !== "cravings");
  return [short, doing, breaking].map((pool, k) => cardOf(pool[(seed * (7 + k * 4) + k) % pool.length]));
}

/** Strip what the app shouldn't show yet: a source nobody has checked. */
export function publicIdea(i: Idea): Idea {
  if (i.evidence.checked) return i;
  return { ...i, evidence: { grade: "judgement", note: "Our starting point. Set your own if it doesn't fit.", checked: true } };
}
