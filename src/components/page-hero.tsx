import type { ReactNode } from "react";

export function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <section className="overflow-hidden bg-primary text-primary-foreground"><div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"><div className="max-w-3xl"><p className="text-sm font-bold uppercase text-accent">{eyebrow}</p><h1 className="mt-3 text-5xl leading-none sm:text-7xl">{title}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-primary-foreground/75 sm:text-lg">{description}</p>{children}</div></div></section>;
}