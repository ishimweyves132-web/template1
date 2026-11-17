# Offline dictionary

## What ships
**No dictionary data is included in the app or this repository.** The app contains the downloader, verifier, installer
and search. You publish a *pack* (a static file plus a tiny `manifest.json`) anywhere you control, e.g. next to the app
in `dist/dict/`, and the app downloads it on demand.

## Pack format
`manifest.json`: `{ version, file, size, sha256, count, license, source }`; `file` is a gzip'd JSON-Lines file named
`*.pack` (**not `.gz`**: many servers add `Content-Encoding: gzip` to `.gz` files, which silently changes the bytes and
breaks checksum verification. The app detects this and says so).
One entry per line: `{"w":"chat","p":"noun","g":"m","ipa":"/ʃa/","d":[{"t":"cat","l":"en"}],"x":[{"f":"...","e":"..."}]}`
(`g` = m / f / mf; `d[].l` = `en` translation or `fr` definition; `x` = example sentences).

Before downloading, the app reads the manifest, asks the server for the file's real `Content-Length` (HEAD), refuses if
it disagrees with the manifest, and shows that size. Progress is kept in IndexedDB, so an interrupted download resumes
with an HTTP `Range` request. Nothing is installed until the SHA-256 matches; a mismatch discards the download, and an
already-installed dictionary stays usable until a new one is verified.

## Build a pack
```
node tools/build-pack.mjs --in kaikki-french.jsonl --lang en --out dist/dict \
     --source "kaikki.org / Wiktionary" --license "CC BY-SA 4.0 and GFDL" --version 2026-11
```
`--lang en` for French->English glosses (English Wiktionary extract), `--lang fr` for French->French definitions
(French Wiktionary extract). Gender, IPA and up to 3 examples per entry are extracted; inflected-form detail is dropped to keep the pack small.

## Datasets: research status (read this)
**I could not verify any of these from the build environment**: its network policy blocked `kaikki.org` and
`download.freedict.org` (HTTP 403), so sizes below are *not measured* and must be checked before you publish.

| source | what it offers | licence (to confirm on the source page) | notes |
|---|---|---|---|
| Kaikki.org (Wiktextract of Wiktionary) | by far the most complete: definitions, gender, IPA, examples; French-language and English-language Wiktionary editions give FR->FR and FR->EN respectively | Wiktionary text is CC BY-SA 4.0 (dual GFDL). Redistribution is allowed **with attribution and share-alike**: the pack must carry the same licence and credit Wiktionary contributors. The app shows the licence text from the manifest | full French extracts are large (tens to hundreds of MB raw); expect to trim. Builder supports Kaikki's JSONL fields (`word, pos, senses[].glosses/tags/examples, sounds[].ipa, head_templates`) but was only tested on a hand-written sample in that shape |
| FreeDict `fra-eng` | small bilingual FR->EN headword list | GPL (check the exact version's header) | small and easy to host, but typically no definitions, examples or reliable gender; would need a separate TEI converter, **not implemented** because the format could not be inspected |
| Other | none evaluated | | |

Audio pronunciation: **not offered**. No suitably licensed offline audio set was verified, so the app shows IPA only when the data has it.
