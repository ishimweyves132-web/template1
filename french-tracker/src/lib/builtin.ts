import { WORDS } from "../data/words";
import { PHRASES, type Phrase } from "../data/phrases";
import { normalize, type DictEntry } from "./dict";

const ENTRIES: DictEntry[] = WORDS.map((w) => ({
  k: normalize(w.w), w: w.w, p: w.p, ...(w.g ? { g: w.g } : {}), d: [{ t: w.en, l: "en" as const }], x: [{ f: w.fr, e: w.fe }],
}));
export const BUILTIN_WORD_COUNT = ENTRIES.length;

/** French headword search: exact match first, then words starting with the query. Accent/case-insensitive. */
export function searchBuiltin(query: string, limit = 25): DictEntry[] {
  const q = normalize(query);
  if (!q) return [];
  const exact = ENTRIES.filter((e) => e.k === q);
  const prefix = ENTRIES.filter((e) => e.k !== q && e.k.startsWith(q));
  return [...exact, ...prefix].slice(0, limit);
}

/** "How do I say X?": entries whose English meaning contains X as a word (or word start). */
export function searchByMeaning(query: string, limit = 12): DictEntry[] {
  const q = normalize(query);
  if (q.length < 3) return [];
  const re = new RegExp(`(^|[^a-z])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  return ENTRIES.filter((e) => e.d.some((d) => re.test(normalize(d.t).replace(/\(.*?\)/g, " ")))).slice(0, limit);
}

export function searchPhrases(query: string, category: string): Phrase[] {
  const q = normalize(query);
  return PHRASES.filter((p) => (!category || p.cat === category) && (!q || normalize(`${p.fr} ${p.en} ${p.note}`).includes(q)));
}
