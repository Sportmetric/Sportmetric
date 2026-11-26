import type { ReactNode } from "react";

export type Tone = "cyan" | "violet" | "mint" | "amber" | "rose" | "pink" | "neutral";

const TONES: Record<Tone, string> = {
  cyan: "border-glow-cyan/35 bg-glow-cyan/15 text-glow-cyan",
  violet: "border-glow-violet/40 bg-glow-violet/15 text-glow-violet",
  mint: "border-glow-mint/35 bg-glow-mint/15 text-glow-mint",
  amber: "border-glow-amber/40 bg-glow-amber/15 text-glow-amber",
  rose: "border-glow-rose/40 bg-glow-rose/15 text-glow-rose",
  pink: "border-glow-pink/40 bg-glow-pink/15 text-glow-pink",
  neutral: "border-white/15 bg-white/[0.07] text-white/75",
};

export function Badge({ tone = "neutral", children, dot = false, className = "" }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const statusTone: Record<string, Tone> = {
  Pending: "amber", Paid: "cyan", Shipped: "violet", Delivered: "mint", Returned: "rose", Cancelled: "neutral",
  Draft: "neutral", Sent: "cyan", Accepted: "mint", Lost: "rose",
  Lead: "neutral", Contacted: "cyan", Meeting: "violet", Negotiation: "amber", Active: "mint",
  Idea: "neutral", Agreed: "violet", Live: "pink", Done: "mint",
  Planned: "neutral", "In progress": "amber", Published: "mint",
  High: "rose", Medium: "amber", Low: "neutral",
  Ordered: "neutral", "In production": "violet", "In transit": "cyan", Customs: "amber", Arrived: "mint",
};

export const channelTone: Record<string, Tone> = { Skroutz: "amber", Retail: "cyan", B2B: "violet", Direct: "pink" };
