import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { Card, Page, Meter, Empty } from "../ui/kit";
import { DictError, downloadPack, fetchManifest, normalize, removeDictionary, searchDict, type DictEntry, type DictProgress, type Manifest } from "../lib/dict";

const mb = (b: number) => b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
const POS: Record<string, string> = { noun: "noun", verb: "verb", adj: "adjective", adv: "adverb", prep: "preposition", pron: "pronoun", conj: "conjunction", intj: "interjection", phrase: "phrase" };
const GENDER: Record<string, string> = { m: "masculine", f: "feminine", mf: "masculine or feminine" };

export function Dictionary() {
  const { settings, updateSettings, db, notify } = useApp();
  const meta = settings.dict;
  return (
    <Page title="Dictionary" back="#/more">
      {meta?.installed ? <Search /> : null}
      <Install installed={!!meta?.installed} />
      {meta?.installed && (
        <Card title="Installed dictionary">
          <p>{meta.count.toLocaleString()} entries · {mb(meta.size)} download · version {meta.version}</p>
          <p className="small">Source: {meta.source}<br />Licence: {meta.license}</p>
          <p className="note">Works fully offline. No audio pronunciation is included.</p>
          <button className="btn danger" onClick={async () => { if (confirm("Remove the dictionary from this device? Your saved vocabulary is kept.")) { await removeDictionary(db); await updateSettings({ dict: null }); notify("Dictionary removed"); } }}>Remove dictionary</button>
        </Card>
      )}
    </Page>
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
    <Card title="Update dictionary"><p className="muted">Needs internet only while downloading.</p><button className="btn" onClick={check} disabled={busy}>Check for a download</button></Card>
  );
  return (
    <Card title={installed ? "Update dictionary" : "Offline dictionary (optional)"}>
      {!installed && <p>Download a French dictionary once, then look up words with no internet. The download is separate from the app, so the app itself stays small.</p>}
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
  const { db, vocab, saveVocab, notify } = useApp();
  const [q, setQ] = useState(""); const [res, setRes] = useState<DictEntry[]>([]);
  useEffect(() => {
    let live = true; const id = setTimeout(() => { if (q.trim()) void searchDict(db, q).then((r) => live && setRes(r)); else setRes([]); }, 120);
    return () => { live = false; clearTimeout(id); };
  }, [q, db]);
  const merged = new Map<string, DictEntry[]>();
  res.forEach((e) => merged.set(e.w, [...(merged.get(e.w) ?? []), e]));
  return (
    <>
      <input className="search" type="search" lang="fr" autoCapitalize="none" autoCorrect="off" placeholder="Search a French word" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the dictionary" />
      {q.trim() && res.length === 0 && <Card><Empty>No entry for “{q}”. Accents are optional.</Empty></Card>}
      {[...merged.entries()].map(([w, entries]) => {
        const saved = vocab.find((v) => normalize(v.fr) === normalize(w));
        const first = entries.flatMap((e) => e.d)[0]?.t ?? "";
        const ex = entries.flatMap((e) => e.x ?? [])[0];
        return (
          <Card key={w} className="entry">
            <div className="sess"><h2 className="grow word" lang="fr">{w}</h2>
              {!saved ? <button className="btn small" onClick={() => saveVocab({ fr: w, en: entries.some((e) => e.d.some((d) => d.l === "en")) ? first : "", example: ex?.f ?? "", notes: first && !entries.some((e) => e.d.some((d) => d.l === "en")) ? first : "", source: "dictionary" }).then(() => notify(`“${w}” saved to vocabulary`))}>＋ Save</button>
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
      })}
    </>
  );
}
