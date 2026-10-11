import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Clock3, Phone, Star } from "lucide-react";
import heroImage from "@/assets/clearflow-hero.jpg";
import inspectionImage from "@/assets/clearflow-inspection.jpg";
import { Button } from "@/components/ui/button";
import { business, reviews, services } from "@/lib/site-data";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "ClearFlow Septic | Clean, Dependable Septic Care" },
    { name: "description", content: "Professional septic pumping, inspections, cleaning, repairs, and maintenance for Clearwater County." },
    { property: "og:title", content: "ClearFlow Septic | Clean, Dependable Septic Care" },
    { property: "og:description", content: "Straight answers, clean work, and dependable septic care." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Index,
});

function Index() {
  return (
    <>
      <section className="relative min-h-[calc(100svh-7rem)] overflow-hidden bg-brand-deep text-primary-foreground">
        <img src={heroImage} alt="ClearFlow technicians servicing a home septic system" width={1600} height={1000} className="absolute inset-0 size-full object-cover object-[62%_center] opacity-75" />
        <div className="absolute inset-0 bg-linear-to-r from-brand-deep via-brand-deep/80 to-brand-deep/10" />
        <div className="relative mx-auto flex min-h-[calc(100svh-7rem)] max-w-7xl items-center px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-brand-deep/60 px-3 py-1.5 text-xs font-bold uppercase backdrop-blur"><BadgeCheck className="size-4 text-accent" /> Local. Licensed. Ready.</div>
            <h1 className="text-6xl leading-[0.9] sm:text-8xl lg:text-9xl">Septic service without the stress.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-primary-foreground/80 sm:text-xl">Clean work, clear answers, and dependable care for the system your property relies on.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button variant="hero" size="lg" asChild><Link to="/book">Book a service <ArrowRight /></Link></Button><Button variant="inverse" size="lg" asChild><a href={business.phoneHref}><Phone /> {business.phone}</a></Button></div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-primary-foreground/75"><span className="flex items-center gap-2"><Clock3 className="size-4 text-accent" /> Same-week availability</span><span className="flex items-center gap-2"><Star className="size-4 fill-accent text-accent" /> 4.9 neighborhood rating</span></div>
          </div>
        </div>
      </section>

      <section className="bg-background py-20 sm:py-28"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:items-end"><div><p className="text-sm font-bold uppercase text-brand-teal">Complete septic care</p><h2 className="mt-3 text-5xl leading-none text-primary sm:text-6xl">One trusted crew. Every essential service.</h2></div><p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">From routine pumping to the first sign of trouble, we show up prepared and explain the next step before the work starts.</p></div><div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-3">{services.map(({title,description,icon:Icon}) => <article key={title} className="bg-card p-7 transition-colors hover:bg-brand-mist"><Icon className="size-7 text-brand-teal" /><h3 className="mt-7 text-2xl text-primary">{title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p></article>)}</div><Button variant="link" className="mt-6 px-0" asChild><Link to="/services">Explore all services <ArrowRight /></Link></Button></div></section>

      <section className="bg-brand-mist py-20 sm:py-28"><div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8"><div className="overflow-hidden rounded-lg"><img src={inspectionImage} alt="ClearFlow technician inspecting a septic line" loading="lazy" width={1400} height={1000} className="aspect-[7/5] size-full object-cover" /></div><div><p className="text-sm font-bold uppercase text-brand-teal">No guesswork</p><h2 className="mt-3 text-5xl leading-none text-primary sm:text-6xl">See the issue. Know the options.</h2><p className="mt-5 text-base leading-7 text-muted-foreground">We use modern inspection tools and practical experience to give you a clear picture—not a pressure pitch.</p><ol className="mt-8 grid gap-5">{["Tell us what you’re noticing","We inspect and explain what we find","You choose the right next step"].map((step,index)=><li key={step} className="grid grid-cols-[auto_1fr] items-center gap-4"><span className="grid size-9 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{index+1}</span><span className="font-semibold">{step}</span></li>)}</ol><Button className="mt-9" asChild><Link to="/receptionist">Ask our AI receptionist</Link></Button></div></div></section>

      <section className="py-20 sm:py-28"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="text-center"><p className="text-sm font-bold uppercase text-brand-teal">Neighbors trust ClearFlow</p><h2 className="mt-3 text-5xl text-primary sm:text-6xl">Service that earns the next call.</h2></div><div className="mt-12 grid gap-5 md:grid-cols-3">{reviews.map((review)=><blockquote key={review.name} className="rounded-lg border border-border bg-card p-7 shadow-sm"><div className="flex gap-1 text-accent">{Array.from({length:5}).map((_,i)=><Star key={i} className="size-4 fill-current" />)}</div><p className="mt-5 text-base leading-7">“{review.quote}”</p><footer className="mt-7 text-sm"><strong>{review.name}</strong><span className="ml-2 text-muted-foreground">{review.location}</span></footer></blockquote>)}</div></div></section>

      <section className="bg-accent text-accent-foreground"><div className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div><h2 className="text-4xl sm:text-5xl">Ready for a clearer next step?</h2><p className="mt-2 text-accent-foreground/80">Choose a service time that works for your property.</p></div><Button className="shrink-0" asChild><Link to="/book">Book service <ArrowRight /></Link></Button></div></section>
    </>
  );
}
