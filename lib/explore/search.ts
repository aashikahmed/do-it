// Search over the idea cards. Small enough to score every card on every keystroke.

import { DOMAIN_NAMES, laneOf } from "./lanes";
import type { IdeaCard } from "./types";

const STOP = new Set(
  "a an the to of and or for with my me i i'm im am is be in on at it want would like something some do more less get start stop how can always".split(" "),
);

function words(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}' -]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

const stem = (w: string) => w.replace(/(ing|ers|er|ies|es|s)$/, "");

/** One slip for 4 to 6 letters, two from 7 up. Swapped letters count as one slip. */
export function near(a: string, b: string) {
  const max = a.length >= 7 ? 2 : a.length >= 4 ? 1 : 0;
  if (!max || Math.abs(a.length - b.length) > max) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length] <= max;
}

interface Field {
  weight: number;
  phrases: string[];
  words: string[];
  /** worth saying "matched on …" */
  tell: boolean;
}
interface Entry {
  card: IdeaCard;
  fields: Field[];
}

export function buildIndex(cards: IdeaCard[]): Entry[] {
  const field = (weight: number, phrases: string[], tell = false): Field => ({ weight, phrases: phrases.map((p) => p.toLowerCase()), words: phrases.flatMap(words), tell });
  return cards.map((card) => ({
    card,
    fields: [
      field(10, [card.title]),
      field(9, [card.subject]),
      field(6, card.synonyms, true),
      field(5, card.tags, true),
      field(4, [DOMAIN_NAMES[card.domain], laneOf(card.domain).name]),
      field(2, [card.line]),
    ],
  }));
}

/** "10 min outside" → 10 and "outside" */
export function parseMinutes(q: string) {
  const m = /(\d{1,3})\s*(?:m|min|mins|minute|minutes)\b/i.exec(q);
  return m ? { minutes: Number(m[1]), rest: q.replace(m[0], " ") } : { minutes: null, rest: q };
}

export interface Hit {
  card: IdeaCard;
  /** the synonym or tag that matched, when the title doesn't show why */
  why: string;
}

export function searchIdeas(index: Entry[], query: string): Hit[] {
  const { minutes, rest } = parseMinutes(query);
  const ws = words(rest).filter((w) => !STOP.has(w));
  const phrase = rest.trim().toLowerCase();
  const out: (Hit & { score: number })[] = [];
  for (const { card, fields } of index) {
    if (minutes !== null && (card.kind === "break" || card.minutes > minutes)) continue;
    if (!ws.length) {
      if (minutes !== null) out.push({ card, why: "", score: 1 });
      continue;
    }
    let score = 0;
    let hits = 0;
    let why = "";
    for (const w of ws) {
      let best = 0;
      let told = "";
      for (const f of fields) {
        let s = 0;
        for (const t of f.words) {
          if (t === w) s = 1;
          else if (w.length > 2 && t.startsWith(w)) s = Math.max(s, 0.8);
          else if (w.length > 3 && stem(t) === stem(w)) s = Math.max(s, 0.75);
          else if (s < 0.45 && near(w, t)) s = 0.45;
          if (s === 1) break;
        }
        if (s * f.weight > best) {
          best = s * f.weight;
          told = f.tell ? (f.phrases.find((p) => words(p).some((t) => t === w || t.startsWith(w) || near(w, t))) ?? "") : "";
        }
      }
      if (best > 0) hits++;
      score += best;
      why ||= told;
    }
    if (phrase.length > 3 && fields.some((f) => f.weight >= 5 && f.phrases.some((p) => p.includes(phrase)))) score += 8;
    // every word should land; for a long question, most of them
    if (hits === ws.length || (ws.length >= 3 && hits / ws.length >= 0.6)) {
      out.push({ card, why: why && !card.title.toLowerCase().includes(why) ? why : "", score: score * (hits / ws.length) });
    }
  }
  out.sort((a, b) => b.score - a.score || a.card.title.localeCompare(b.card.title));
  const top = out[0]?.score ?? 0;
  return out.filter((r) => r.score >= top * 0.22).map(({ card, why }) => ({ card, why }));
}
