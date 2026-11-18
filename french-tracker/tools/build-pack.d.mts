export interface PackEntry { w: string; p?: string; g?: string; ipa?: string; d: { t: string; l: string }[]; x?: { f: string; e?: string }[]; et?: string; dv?: string[]; rl?: string[]; sy?: string[]; an?: string[]; fm?: string[] }
export function convertEntry(obj: unknown, lang: "en" | "fr"): PackEntry | null;
