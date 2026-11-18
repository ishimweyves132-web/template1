import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { Card, Page, Meter, Empty, Segmented } from "../ui/kit";
import { BUILTIN_WORD_COUNT, searchBuiltin, searchByMeaning, searchPhrases } from "../lib/builtin";
import { PHRASE_CATEGORIES } from "../data/phrases";
import { DictError, downloadPack, fetchManifest, normalize, removeDictionary, searchDict, type DictEntry, type DictProgress, type Manifest } from "../lib/dict";

const mb = (b: number) => b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
const POS: Record<string, string> = { det: "determiner", noun: "noun", verb: "verb", adj: "adjective", adv: "adverb", prep: "preposition", pron: "pronoun", conj: "conjunction", intj: "interjection", phrase: "phrase" };
const GENDER: Record<string, string> = { m: "masculine", f: "feminine", mf: "masculine or feminine" };

export function Dictionary() {
  const { settings, updateSettings, db, notify, dictInstall } = useApp();
  const meta = settings.dict;
  const [tab, setTab] = useState<"words" | "phrases">("words");
  return (
    <Page title="Dictionary" back="#/more">
      {dictInstall && (
        <Card title="Setting up the full dictionary">
          <p className="muted">One-time, offline, about a minute. You can keep using the app; the built-in words already work.</p>
          <Meter value={dictInstall.done} max={dictInstall.total || 1} />
          <small className="sub">{dictInstall.phase === "verify" ? "Verifying file" : `Installing ${dictInstall.done.toLocaleString()} of ${dictInstall.total.toLocaleString()} entries`}</small>
        </Card>
      )}
      <Segmented label="Dictionary sections" value={tab} onChange={setTab} options={[{ v: "words", t: "Words" }, { v: "phrases", t: "Phrasebook" }]} />
      {tab === "phrases" ? <Phrasebook /> : (
        <>
          <Search />
          <Install installed={!!meta?.installed} />
          {meta?.installed && (
            <Card title="Full dictionary">
              <p>{meta.count.toLocaleString()} entries · {mb(meta.size)} download · version {meta.version}</p>
              <p className="small">Source: {meta.source}<br />Licence: {meta.license}</p>
              <p className="note">Works fully offline. No audio pronunciation is included.</p>
              {/CC BY-SA/.test(meta.license) && <p className="small muted">Entries are by Wiktionary contributors (CC BY-SA 4.0 and GFDL), extracted by kaikki.org with Wiktextract. Shared under the same licences.</p>}
              <button className="btn danger" onClick={async () => { if (confirm("Remove the downloaded dictionary from this device? Your saved vocabulary and the built-in words are kept.")) { await removeDictionary(db); await updateSettings({ dict: null }); notify("Dictionary removed"); } }}>Remove full dictionary</button>
            </Card>
          )}
        </>
      )}
    </Page>
  );
}

function Phrasebook() {
  const { vocab, saveVocab, notify } = useApp();
  const [q, setQ] = useState(""); const [cat, setCat] = useState("");
  const list = searchPhrases(q, cat);
  return (
    <>
      <input className="search" type="search" placeholder="Search phrases in French or English" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search phrases" />
      <div className="chips" role="group" aria-label="Phrase categories">
        <button className={`chip ${cat === "" ? "on" : ""}`} onClick={() => setCat("")}>All</button>
        {PHRASE_CATEGORIES.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <p className="note pad">{list.length} phrase{list.length === 1 ? "" : "s"} · built in, works offline. Write-ups are original to this app.</p>
      {list.length === 0 && <Card><Empty>No phrase matches “{q}”.</Empty></Card>}
      {list.map((p) => {
        const saved = vocab.some((v) => normalize(v.fr) === normalize(p.fr));
        return (
          <Card key={p.fr} className="phrase">
            <p className="pfr" lang="fr">{p.fr}</p>
            <p>{p.en}</p>
            {p.note && <p className="muted small">{p.note}</p>}
            <div className="sess"><span className="tag">{p.cat}</span><span className="grow" />
              {saved ? <span className="pill done">Saved</span> : <button className="btn small" onClick={() => saveVocab({ fr: p.fr, en: p.en, notes: p.note, source: "dictionary" }).then(() => notify("Phrase saved to vocabulary"))}>＋ Save</button>}</div>
          </Card>
        );
      })}
    </>
  );
}

function Install({ installed }: { installed: boolean }) {
  const { settings, updateSettings, db, notify } = useApp();
  const [info, setInfo] = useState<{ manifest: Manifest; actualSize: number } | null>(null);
  const [prog, setProg] = useState<DictProgress | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState(0);
  const ac = useRef<AbortController | null>(null);
  useEffect(() => { void db.get<{ received: number }>("partial", "pack").then((p) => setPartial(p?.received ?? 0)); }, [db, busy]);

  const check = async () => {
    setErr(""); setBusy(true);
    try { setInfo(await fetchManifest(settings.dictUrl)); } catch (e) { setErr((e as Error).message); setInfo(null); }
    setBusy(false);
  };
  const go = async () => {
    setErr(""); setBusy(true); ac.current = new AbortController();
    try { await downloadPack(db, settings.dictUrl, setProg, ac.current.signal); await updateSettings({ dict: await db.loadSettings().then((s) => s.dict) }); notify("Dictionary installed"); setInfo(null); }
    catch (e) { setErr(e instanceof DictError ? e.message : `Unexpected error: ${(e as Error).message}`); }
    setBusy(false); setProg(null);
  };
  if (installed && !info && !err) return (
    <Card title="Bigger dictionary"><p className="muted">Needs internet only while downloading.</p><button className="btn" onClick={check} disabled={busy}>Check for a download</button></Card>
  );
  return (
    <Card title={installed ? "Update downloaded dictionary" : "Bigger dictionary (optional download)"}>
      {!installed && <p>The built-in starter has {BUILTIN_WORD_COUNT} common words. For thousands more, with definitions, download a full dictionary pack once and search it offline. It is separate from the app, so the app stays small.</p>}
      {!info && <button className="btn primary" onClick={check} disabled={busy}>{busy ? "Checking…" : partial ? "Check and resume download" : "Check download size"}</button>}
      {info && (
        <div>
          <p className="big">{mb(info.actualSize)}</p>
          <p className="small">{info.manifest.count.toLocaleString()} entries · version {info.manifest.version}<br />Source: {info.manifest.source}<br />Licence: {info.manifest.license}<br />Size confirmed by the server before downloading.</p>
          {partial > 0 && partial < info.actualSize && <p className="note">A previous download stopped at {mb(partial)}. It will resume from there.</p>}
          {!busy && <button className="btn primary block" onClick={go}>{partial ? "Resume download" : `Download ${mb(info.actualSize)}`}</button>}
          {busy && <button className="btn block" onClick={() => ac.current?.abort()}>Pause</button>}
        </div>
      )}
      {prog && <div className="prog"><Meter value={prog.done} max={prog.total || 1} /><small>{{ download: "Downloading", verify: "Verifying checksum", install: "Installing" }[prog.phase]} {prog.phase !== "verify" ? `${Math.floor((prog.done / (prog.total || 1)) * 100)}%` : ""}</small></div>}
      {err && <p className="error" role="alert">{err}</p>}
      <details><summary>Dictionary address</summary>
        <label className="field"><span>Manifest URL</span><input value={settings.dictUrl} onChange={(e) => updateSettings({ dictUrl: e.target.value })} /></label>
        <p className="small muted">Point this at any pack built with tools/build-pack.mjs. See docs/DICTIONARY.md.</p></details>
    </Card>
  );
}

function Search() {
  const { db, vocab, saveVocab, notify, settings } = useApp();
  const hasPack = !!settings.dict?.installed;
  const [q, setQ] = useState(""); const [res, setRes] = useState<DictEntry[]>([]); const [alt, setAlt] = useState<DictEntry[]>([]);
  useEffect(() => {
    let live = true;
    const id = setTimeout(async () => {
      if (!q.trim()) { setRes([]); setAlt([]); return; }
      const pack = hasPack ? await searchDict(db, q) : [];
      const have = new Set(pack.map((e) => normalize(e.w)));
      // The downloaded pack is more complete, so it wins for any headword it has; built-in fills the gaps.
      const built = searchBuiltin(q).filter((e) => !have.has(e.k));
      const main = [...pack, ...built];
      const mainKeys = new Set(main.map((e) => e.k));
      if (live) { setRes(main); setAlt(main.length >= 3 ? [] : searchByMeaning(q).filter((e) => !mainKeys.has(e.k))); }
    }, 120);
    return () => { live = false; clearTimeout(id); };
  }, [q, db, hasPack]);
  const group = (list: DictEntry[]) => { const m = new Map<string, DictEntry[]>(); list.forEach((e) => m.set(e.w, [...(m.get(e.w) ?? []), e])); return [...m.entries()]; };
  const card = (w: string, entries: DictEntry[], cls: string) => {
    const saved = vocab.find((v) => normalize(v.fr) === normalize(w));
    const hasEn = entries.some((e) => e.d.some((d) => d.l === "en"));
    const first = entries.flatMap((e) => e.d)[0]?.t ?? "";
    const ex = entries.flatMap((e) => e.x ?? [])[0];
    return (
      <Card key={w} className={cls}>
        <div className="sess"><h2 className="grow word" lang="fr">{w}</h2>
          {!saved ? <button className="btn small" onClick={() => saveVocab({ fr: w, en: hasEn ? first : "", example: ex?.f ?? "", notes: !hasEn && first ? first : "", source: "dictionary" }).then(() => notify(`“${w}” saved to vocabulary`))}>＋ Save</button>
            : <button className="btn small on" onClick={() => saveVocab({ ...saved, status: saved.status === "learned" ? "learning" : "learned" })}>{saved.status === "learned" ? "✓ Learned" : "Learning"}</button>}</div>
        {entries.map((e, i) => (
          <div key={i} className="sense">
            <p className="muted">{[e.p && (POS[e.p] ?? e.p), e.g && GENDER[e.g], e.ipa].filter(Boolean).join(" · ")}</p>
            <ol>{e.d.map((d, j) => <li key={j}>{d.t} <small className="muted">({d.l === "en" ? "English" : "français"})</small></li>)}</ol>
            {e.x?.map((x, j) => <p key={j} className="ex" lang="fr">“{x.f}”{x.e && <span className="muted"> — {x.e}</span>}</p>)}
          </div>
        ))}
      </Card>
    );
  };
  return (
    <>
      <input className="search" type="search" lang="fr" autoCapitalize="none" autoCorrect="off" placeholder="Search a French word, or an English meaning" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the dictionary" />
      {!q.trim() && <p className="note pad">{BUILTIN_WORD_COUNT} built-in words with gender and examples, always available offline. Accents are optional when typing.</p>}
      {q.trim() && res.length === 0 && alt.length === 0 && <Card><Empty>No entry for “{q}” in {hasPack ? "the dictionary" : "the built-in words"}. Accents are optional.{!hasPack && " A downloadable dictionary has many more words."}</Empty></Card>}
      {group(res).map(([w, es]) => card(w, es, "entry"))}
      {alt.length > 0 && <p className="note pad">{res.length ? "Also matching in English meanings:" : `No French word “${q}”. Found by English meaning:`}</p>}
      {group(alt).map(([w, es]) => card(w, es, "entry alt"))}
    </>
  );
}
