import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Phone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { business } from "@/lib/site-data";

const nav = [
  ["Services", "/services"], ["About", "/about"], ["Book", "/book"], ["AI Receptionist", "/receptionist"], ["Contact", "/contact"],
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <div className="bg-primary px-4 py-2 text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 text-xs font-semibold sm:text-sm">
          <span className="truncate">Serving {business.area}</span>
          <a className="flex shrink-0 items-center gap-1.5 hover:text-accent" href={business.phoneHref}><Phone className="size-3.5" /> {business.phone}</a>
        </div>
      </div>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid h-18 max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="ClearFlow Septic home"><BrandMark /></Link>
          <div className="hidden items-center gap-7 lg:flex">
            <nav className="flex items-center gap-6" aria-label="Main navigation">
              {nav.map(([label, to]) => <Link key={to} to={to} className="text-sm font-semibold text-foreground/75 transition-colors hover:text-primary" activeProps={{ className: "text-sm font-semibold text-primary" }}>{label}</Link>)}
            </nav>
            <Button asChild><Link to="/book">Book service</Link></Button>
          </div>
          <Button className="lg:hidden" variant="ghost" size="icon" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close menu" : "Open menu"}>{open ? <X /> : <Menu />}</Button>
        </div>
        {open && <div className="border-t border-border bg-background px-4 py-4 lg:hidden"><nav className="mx-auto grid max-w-7xl gap-1" aria-label="Mobile navigation">{nav.map(([label, to]) => <Button key={to} asChild variant="ghost" className="justify-start"><Link to={to}>{label}</Link></Button>)}<Button className="mt-2" asChild><Link to="/book">Book service</Link></Button></nav></div>}
      </header>
    </>
  );
}

export function SiteFooter() {
  return <footer className="bg-brand-deep text-primary-foreground"><div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr] lg:px-8"><div><BrandMark inverse /><p className="mt-5 max-w-sm text-sm leading-6 text-primary-foreground/70">Straight answers, clean work, and dependable septic care for homes and small businesses.</p></div><div><h2 className="text-xl">Explore</h2><div className="mt-4 grid gap-2 text-sm text-primary-foreground/70">{nav.map(([label,to]) => <Link key={to} to={to} className="hover:text-accent">{label}</Link>)}</div></div><div><h2 className="text-xl">Reach us</h2><div className="mt-4 grid gap-2 text-sm text-primary-foreground/70"><a href={business.phoneHref}>{business.phone}</a><a href={`mailto:${business.email}`}>{business.email}</a><span>{business.hours}</span></div></div></div><div className="border-t border-primary-foreground/10"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-primary-foreground/55 sm:flex-row sm:justify-between sm:px-6 lg:px-8"><span>© 2026 ClearFlow Septic. Demo business details.</span><span>Licensed • Insured • Locally operated</span></div></div></footer>;
}