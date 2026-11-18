import { useEffect, useRef, type ReactNode } from "react";
import { ACTIVITIES, ACTIVITY_LABEL, type Activity } from "../lib/model";
import { formatDate, type DateStr } from "../lib/dates";

export const Card = ({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>
    {(title || action) && <header className="card-h"><h2>{title}</h2>{action}</header>}
    {children}
  </section>
);

export const Page = ({ title, back, children, right }: { title: string; back?: string; children: ReactNode; right?: ReactNode }) => (
  <div className="page">
    <header className="page-h">
      {back && <a href={back} className="back" aria-label="Back">‹</a>}
      <h1>{title}</h1>{right}
    </header>
    {children}
  </div>
);

export function Ring({ pct, size = 112, label, sub }: { pct: number; size?: number; label: string; sub?: string }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label}${sub ? ", " + sub : ""}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#3a56d4" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-t"><b>{label}</b>{sub && <small>{sub}</small>}</div>
    </div>
  );
}

export const Meter = ({ value, max, tone }: { value: number; max: number; tone?: string }) => (
  <div className="meter" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
    <i className={tone} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
  </div>
);

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; t: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => <button key={o.v} role="tab" aria-selected={o.v === value} className={o.v === value ? "on" : ""} onClick={() => onChange(o.v)}>{o.t}</button>)}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("keydown", k); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">✕</button></header>
        {children}
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
);

export const ActivityDot = ({ a }: { a: Activity }) => <i className={`dot a-${a}`} aria-hidden />;
export const ActivitySelect = ({ value, onChange }: { value: Activity; onChange: (a: Activity) => void }) => (
  <select value={value} onChange={(e) => onChange(e.target.value as Activity)}>
    {ACTIVITIES.map((a) => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
  </select>
);

export interface BarDatum { label: string; value: number; target?: number; title: string; highlight?: boolean }
/** Plain SVG bar chart: values above bars, optional per-bar target tick, readable text summary for screen readers. */
export function BarChart({ data, height = 150, summary }: { data: BarDatum[]; height?: number; summary: string }) {
  const W = 320, pad = { t: 16, b: 22, l: 4, r: 4 };
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.target ?? 0]));
  const bw = (W - pad.l - pad.r) / data.length, h = height - pad.t - pad.b;
  const showVals = data.length <= 14;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={summary}>
      <line x1={0} x2={W} y1={height - pad.b} y2={height - pad.b} className="axis" />
      {data.map((d, i) => {
        const x = pad.l + i * bw, bh = (d.value / max) * h, y = height - pad.b - bh;
        const ty = d.target ? height - pad.b - (d.target / max) * h : null;
        return (
          <g key={i}>
            <title>{d.title}</title>
            <rect x={x + bw * 0.16} width={bw * 0.68} y={y} height={Math.max(bh, d.value > 0 ? 1 : 0)} rx={3} className={d.highlight ? "bar hi" : "bar"} />
            {ty !== null && <line x1={x + bw * 0.08} x2={x + bw * 0.92} y1={ty} y2={ty} className="tick" />}
            {showVals && d.value > 0 && <text x={x + bw / 2} y={Math.max(y - 3, 9)} className="val" textAnchor="middle">{Math.round(d.value)}</text>}
            <text x={x + bw / 2} y={height - 7} className="lbl" textAnchor="middle">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const dayLabel = (d: DateStr) => formatDate(d, { day: "numeric", month: "short" });
export const weekdayShort = (d: DateStr) => formatDate(d, { weekday: "short" }).slice(0, 2);
export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>;
