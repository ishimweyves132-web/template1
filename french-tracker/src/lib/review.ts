// Spaced review for saved words. Interval (days) after the n-th review: 1, 3, 7, 14, 30, 60 (then stays 60).
// A word is due when today >= (last review, or the day it was added) + interval. Words marked "learned" are not scheduled.
import { addDays, diffDays, type DateStr } from "./dates";
import type { VocabEntry } from "./model";

export const INTERVALS = [1, 3, 7, 14, 30, 60];

export function nextDue(v: VocabEntry): DateStr {
  const base = v.reviews.length ? v.reviews[v.reviews.length - 1]! : v.addedAt;
  return addDays(base, INTERVALS[Math.min(v.reviews.length, INTERVALS.length - 1)]!);
}
export const isDue = (v: VocabEntry, today: DateStr) => v.status === "learning" && nextDue(v) <= today;
export const dueList = (vocab: VocabEntry[], today: DateStr) =>
  vocab.filter((v) => isDue(v, today)).sort((a, b) => nextDue(a).localeCompare(nextDue(b)));
export const overdueDays = (v: VocabEntry, today: DateStr) => Math.max(0, diffDays(nextDue(v), today));
