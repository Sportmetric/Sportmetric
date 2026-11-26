import type { LucideIcon } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { CountUp } from "./CountUp";
import { Skeleton } from "./Skeleton";
import type { Tone } from "./Badge";

const ICON_TONE: Record<Tone, string> = {
  cyan: "from-glow-cyan/30 to-glow-cyan/5 text-glow-cyan",
  violet: "from-glow-violet/35 to-glow-violet/5 text-glow-violet",
  mint: "from-glow-mint/30 to-glow-mint/5 text-glow-mint",
  amber: "from-glow-amber/30 to-glow-amber/5 text-glow-amber",
  rose: "from-glow-rose/30 to-glow-rose/5 text-glow-rose",
  pink: "from-glow-pink/30 to-glow-pink/5 text-glow-pink",
  neutral: "from-white/20 to-white/5 text-white",
};

interface StatsCardProps {
  label: string;
  value: number;
  format: (v: number) => string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  trend?: { value: number; label: string; goodWhenUp?: boolean } | null;
  loading?: boolean;
  href?: string;
}

export function StatsCard({ label, value, format, icon: Icon, tone = "cyan", hint, trend, loading, href }: StatsCardProps) {
  const up = trend ? trend.value >= 0 : false;
  const good = trend ? (trend.goodWhenUp ?? true) === up : false;
  const body = (
    <GlassCard className="group relative h-full overflow-hidden max-sm:p-4">
      <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-40 blur-2xl ${ICON_TONE[tone]}`} />
      <div className="flex items-start justify-between gap-3">
        <span className="label leading-snug">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/15 ${ICON_TONE[tone]}`}>
          <Icon size={17} strokeWidth={2.2} />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        <div className="mt-2 truncate font-display text-xl font-semibold leading-tight tracking-tight text-white sm:text-[1.55rem]">
          <CountUp value={value} format={format} />
        </div>
      )}
      <div className="mt-1.5 flex min-h-[1.25rem] flex-wrap items-center gap-2 text-xs text-white/55">
        {trend && !loading && (
          <span className={`num font-semibold ${good ? "text-glow-mint" : "text-glow-rose"}`}>
            {up ? "▲" : "▼"} {Math.abs(trend.value * 100).toFixed(0)}%
          </span>
        )}
        {trend && !loading && <span>{trend.label}</span>}
        {!trend && hint && <span>{hint}</span>}
      </div>
    </GlassCard>
  );
  return href ? <a href={href} className="block h-full rounded-2xl">{body}</a> : body;
}
