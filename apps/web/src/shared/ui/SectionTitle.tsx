import type { ReactNode } from "react";

export function SectionTitle({ children }: { readonly children: ReactNode }) {
  return <h2 className="text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase">{children}</h2>;
}
