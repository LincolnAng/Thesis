import type { ReactNode } from "react";

/** The dashboard area fills the width beside the sidebar; each page frames itself with <Page>. */
export function PageShell({ children }: { children: ReactNode }) {
  return <div className="w-full">{children}</div>;
}
