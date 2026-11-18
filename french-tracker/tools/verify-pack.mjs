#!/usr/bin/env node
// Verifies a built dictionary pack against reality: checksum, entry count, and a list of well-known words that must
// be present with the expected gender / meaning. Prints sample entries and coverage statistics for the build log.
//   node tools/verify-pack.mjs <dir> "chat:m:cat,maison:f:house,être::be"
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export function verify(dir, spec) {
  const problems = [];
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
  const buf = readFileSync(`${dir}/${manifest.file}`);
  if (buf.length !== manifest.size) problems.push(`size ${buf.length} != manifest ${manifest.size}`);
  if (createHash("sha256").update(buf).digest("hex") !== manifest.sha256) problems.push("sha256 mismatch");
  const entries = gunzipSync(buf).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  if (entries.length !== manifest.count) problems.push(`count ${entries.length} != manifest ${manifest.count}`);
  const by = new Map();
  for (const e of entries) by.set(e.w, [...(by.get(e.w) ?? []), e]);
  for (const item of spec.split(",").filter(Boolean)) {
    const [w, g = "", gloss = ""] = item.split(":");
    const es = by.get(w);
    if (!es) { problems.push(`missing word: ${w}`); continue; }
    if (g && !es.some((e) => e.g === g || e.g === "mf")) problems.push(`${w}: expected gender ${g}, got ${es.map((e) => e.g ?? "none").join("/")}`);
    if (gloss && !es.some((e) => e.d.some((d) => d.t.toLowerCase().includes(gloss.toLowerCase())))) problems.push(`${w}: no meaning containing "${gloss}" (got: ${es.flatMap((e) => e.d.map((d) => d.t)).slice(0, 3).join(" | ")})`);
  }
  const nouns = entries.filter((e) => e.p === "noun");
  const pos = {}; for (const e of entries) pos[e.p ?? "?"] = (pos[e.p ?? "?"] ?? 0) + 1;
  const stats = {
    entries: entries.length, distinctWords: by.size,
    nounsWithGenderPct: nouns.length ? Math.round((nouns.filter((e) => e.g).length / nouns.length) * 100) : 0,
    withExamplesPct: Math.round((entries.filter((e) => e.x?.length).length / entries.length) * 100),
    withIpaPct: Math.round((entries.filter((e) => e.ipa).length / entries.length) * 100),
    topPos: Object.entries(pos).sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
  return { problems, stats, sample: (spec.split(",")[0] || "").split(":")[0] ? by.get(spec.split(",")[0].split(":")[0]) ?? [] : [] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, spec = ""] = process.argv.slice(2);
  const r = verify(dir, spec);
  console.log("stats:", JSON.stringify(r.stats));
  console.log("sample:", JSON.stringify(r.sample).slice(0, 600));
  if (r.problems.length) { console.error("VERIFY FAILED:\n - " + r.problems.join("\n - ")); process.exit(5); }
  console.log("pack verified OK");
}
