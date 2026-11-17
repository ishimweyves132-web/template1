#!/usr/bin/env node
// Builds a dictionary pack (gzip JSON-Lines + manifest.json) from a Kaikki.org / Wiktextract JSONL extract.
//
//   node tools/build-pack.mjs --in fr-extract.jsonl --lang en --out public/dict \
//        --version 2026-11 --source "kaikki.org (Wiktionary)" --license "CC BY-SA 4.0 + GFDL"
//
// --lang en : glosses are English  -> French→English translations (English Wiktionary extract)
// --lang fr : glosses are French   -> French→French definitions   (French Wiktionary extract)
// The licence string is written to the manifest and shown to the user in the app. YOU are responsible for
// using only data you are allowed to redistribute (see docs/DICTIONARY.md).
import { createReadStream, createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { createGzip } from "node:zlib";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const GENDER_TAGS = { masculine: "m", feminine: "f" };

export function convertEntry(obj, lang) {
  if (!obj || typeof obj.word !== "string" || (obj.lang_code && obj.lang_code !== "fr")) return null;
  const senses = (obj.senses ?? []).filter((s) => Array.isArray(s.glosses) && s.glosses.length);
  if (!senses.length) return null;
  const tags = new Set([...(obj.tags ?? []), ...senses.flatMap((s) => s.tags ?? [])]);
  const found = [...tags].filter((t) => GENDER_TAGS[t]).map((t) => GENDER_TAGS[t]);
  let g = found.length > 1 ? "mf" : found[0];
  if (!g) {
    const m = /\b(m|f|mf)\b/.exec((obj.head_templates?.[0]?.expansion ?? "").replace(/\(.*?\)/g, ""));
    if (m) g = m[1];
  }
  const d = senses.slice(0, 8).map((s) => ({ t: s.glosses.join(" — ").slice(0, 400), l: lang }));
  const x = senses.flatMap((s) => s.examples ?? []).filter((e) => e.text && e.text.length < 220).slice(0, 3)
    .map((e) => (e.english ? { f: e.text, e: e.english } : { f: e.text }));
  const ipa = (obj.sounds ?? []).find((s) => s.ipa)?.ipa;
  const out = { w: obj.word, d };
  if (obj.pos) out.p = obj.pos;
  if (g) out.g = g;
  if (ipa) out.ipa = ipa;
  if (x.length) out.x = x;
  return out;
}

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []));
  if (!a.in || !a.lang || !a.out || !a.license || !a.source) {
    console.error("Usage: build-pack.mjs --in file.jsonl --lang en|fr --out dir --source '...' --license '...' [--version v]");
    process.exit(2);
  }
  mkdirSync(a.out, { recursive: true });
  const file = `fr-${a.lang}.pack`; // NOT .gz: many servers add Content-Encoding to .gz files, which breaks checksum verification
  let count = 0;
  const lines = (async function* () {
    for await (const line of createInterface({ input: createReadStream(a.in), crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      let e;
      try { e = convertEntry(JSON.parse(line), a.lang); } catch { continue; }
      if (e) { count++; yield JSON.stringify(e) + "\n"; }
    }
  })();
  await pipeline(Readable.from(lines), createGzip({ level: 9 }), createWriteStream(`${a.out}/${file}`));
  const { size } = (await import("node:fs")).statSync(`${a.out}/${file}`);
  const hash = createHash("sha256");
  await pipeline(createReadStream(`${a.out}/${file}`), async function (src) { for await (const c of src) hash.update(c); });
  const manifest = { version: a.version ?? new Date().toISOString().slice(0, 10), file, size, sha256: hash.digest("hex"), count, license: a.license, source: a.source, languages: ["fr", a.lang] };
  writeFileSync(`${a.out}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`${count} entries, ${(size / 1e6).toFixed(2)} MB -> ${a.out}/manifest.json`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
