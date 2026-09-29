import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/15 text-primary",
        ok: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
        atencion: "border-amber-500/30 bg-amber-500/15 text-amber-400",
        mal: "border-red-500/30 bg-red-500/15 text-red-400",
        na: "border-zinc-500/30 bg-zinc-500/15 text-zinc-400",
        muted: "border-border bg-muted text-muted-foreground",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}
