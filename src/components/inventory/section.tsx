"use client";

/**
 * The shape every section on this page shares: a quiet all-caps label saying what question
 * is being answered, then the answer as one sentence in display type, then the tiles.
 *
 * The label is deliberately the smallest thing and the answer the largest — the heading is
 * only there to say which question you're looking at, and the sentence is the point.
 */

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">{children}</h2>;
}

export function Answer({ children, tone = "normal" }: { children: React.ReactNode; tone?: "normal" | "good" | "bad" }) {
  return (
    <p
      className={`font-display text-[20px] font-semibold ${
        tone === "bad" ? "text-danger" : tone === "good" ? "text-success" : "text-foreground"
      }`}
    >
      {children}
    </p>
  );
}
