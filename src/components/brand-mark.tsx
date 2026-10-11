import { Droplets } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", inverse ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground")}>
        <Droplets className="size-5" aria-hidden="true" />
      </span>
      {!compact && <span className={cn("truncate font-display text-2xl leading-none", inverse ? "text-primary-foreground" : "text-primary")}>ClearFlow <span className={inverse ? "text-accent" : "text-brand-teal"}>Septic</span></span>}
    </span>
  );
}