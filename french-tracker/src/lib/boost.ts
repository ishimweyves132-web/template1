import type { DateStr } from "./dates";
import { diffDays } from "./dates";
import { TIPS, tipById, tipFor, type Tip } from "../data/playbook";
import type { TargetEra } from "./model";
import { activityRows } from "./weakness";
import type { Ledger } from "./stats";

export interface Boost { tip: Tip; reason: string }

/** One concrete suggestion for today, chosen from the user's own records (never random when there is data). */
export function todaysBoost(l: Ledger, history: TargetEra[], today: DateStr): Boost {
  if (l.first) {
    const studiedYesterday = (l.days.get(prevDay(today))?.total ?? 0) > 0;
    const studiedToday = (l.days.get(today)?.total ?? 0) > 0;
    const hasEverStudiedBefore = [...l.days.keys()].some((d) => d < prevDay(today) && (l.days.get(d)?.total ?? 0) > 0);
    if (!studiedToday && !studiedYesterday && hasEverStudiedBefore) {
      return { tip: tipById("never-twice")!, reason: "Yesterday had no practice. The one rule is never miss twice." };
    }
    if (diffDays(l.first, today) >= 2) {
      const rows = activityRows(l, history, today).filter((r) => r.target > 0).sort((a, b) => a.pctOfTarget - b.pctOfTarget);
      const worst = rows[0];
      if (worst && worst.pctOfTarget < 80) {
        return { tip: tipFor(worst.activity), reason: `${cap(worst.activity)} has the lowest share of its target lately (${worst.pctOfTarget}%).` };
      }
    }
  }
  const [y = 2026, m = 1, d = 1] = today.split("-").map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return { tip: TIPS[day % TIPS.length]!, reason: l.first ? "Your targets are balanced. Here is a habit to sharpen." : "A good first habit to try." };
}
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const prevDay = (s: DateStr) => { const [y = 0, m = 1, d = 1] = s.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d - 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`; };
