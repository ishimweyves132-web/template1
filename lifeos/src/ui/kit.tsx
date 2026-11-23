import { useEffect, useRef, type ReactNode } from "react";

export const Icon = ({ n }: { n: "today" | "vision" | "planner" | "progress" | "coach" | "settings" }) => {
  const d: Record<string, ReactNode> = {
    today: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>, vision: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.6" /></>,
    planner: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>, progress: <path d="M4 19V9m6 10V5m6 14v-7m4 7H3" />,
    coach: <><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /><path d="M18 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>, settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1m0-12.8l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden>{d[n]}</svg>;
};
export const Card = ({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>{(title || action) && <header className="card-h">{title && <h3>{title}</h3>}{action}</header>}{children}</section>
);
export const PageHead = ({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) => (
  <header className="page-h"><div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>{right}</header>
);
export function Ring({ frac, size = 92, label, sub }: { frac: number | null; size?: number; label: string; sub?: string }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r, v = frac === null ? 0 : Math.max(0, Math.min(1, frac));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label}${sub ? ", " + sub : ""}`}>
      <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="7" /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sage)" strokeWidth="7" strokeLinecap={v > 0 ? "round" : "butt"} strokeDasharray={`${v * c} ${c}`} /></svg>
      <div className="t"><div><b className="num">{label}</b>{sub && <small>{sub}</small>}</div></div>
    </div>
  );
}
export const Bar = ({ frac, tone = "" }: { frac: number | null; tone?: "" | "sand" | "warn" }) => (
  <div className={`bar ${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={frac === null ? undefined : Math.round(frac * 100)}><i style={{ width: `${frac === null ? 0 : Math.max(0, Math.min(1, frac)) * 100}%` }} /></div>
);
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; t: string }[]; onChange: (v: T) => void; label: string }) {
  return <div className="seg" role="tablist" aria-label={label}>{options.map((o) => <button key={o.v} role="tab" aria-selected={o.v === value} className={o.v === value ? "on" : ""} onClick={() => onChange(o.v)}>{o.t}</button>)}</div>;
}
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null; ref.current?.querySelector<HTMLElement>("input,select,textarea,button:not(.x)")?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("keydown", k); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}><header><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">✕</button></header>{children}</div>
    </div>
  );
}
export const Field = ({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) => (
  <label className="field"><span>{label}</span>{children}{error ? <small>{error}</small> : hint ? <small className="hint">{hint}</small> : null}</label>
);
export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>;
export const Check = ({ state, onClick, label }: { state: "open" | "done" | "partial"; onClick: () => void; label: string }) => (
  <button className={`check ${state === "open" ? "" : state}`} onClick={onClick} aria-label={label} aria-pressed={state !== "open"}>{state === "done" && <svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" /></svg>}{state === "partial" && <svg viewBox="0 0 16 16"><path d="M3 8h10" /></svg>}</button>
);
