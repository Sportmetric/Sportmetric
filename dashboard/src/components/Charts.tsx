import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtEur, fmtEur0 } from "../lib/format";

export const CHART_COLORS = { cyan: "#5EE7FF", violet: "#A78BFA", pink: "#F472B6", mint: "#5EF2B5", amber: "#FFC56B", rose: "#FF6B8B", blue: "#6C8CFF", grey: "#B9B4D9" };
export const CHANNEL_COLORS: Record<string, string> = { Skroutz: CHART_COLORS.amber, Retail: CHART_COLORS.cyan, B2B: CHART_COLORS.violet, Direct: CHART_COLORS.pink };

const axis = { stroke: "rgba(255,255,255,0.45)", fontSize: 11, tickLine: false, axisLine: false } as const;

function GlassTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/20 bg-[#17124a]/90 px-3 py-2 text-xs shadow-glass backdrop-blur-xl">
      {label && <div className="mb-1 font-semibold text-white">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-white/80">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="num ml-auto pl-4 font-semibold text-white">{fmtEur(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export interface SeriesDef { key: string; name: string; color: string; type?: "bar" | "line"; stack?: string }

/** Bars (optionally stacked) with optional line series, sharing one € axis. */
export function BarLineChart({ data, xKey, series, height = 280 }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.95} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.35} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey={xKey} {...axis} />
          <YAxis {...axis} width={64} tickFormatter={(v: number) => fmtEur0(v)} />
          <Tooltip content={<GlassTooltip />} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }} iconType="circle" iconSize={8} />}
          {series.map((s) =>
            s.type === "line" ? (
              <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={{ r: 3, fill: s.color }} animationDuration={1100} />
            ) : (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={`url(#g-${s.key})`} stackId={s.stack} radius={s.stack ? [0, 0, 0, 0] : [8, 8, 2, 2]} maxBarSize={38} animationDuration={900} />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBarChart({ data, xKey, yKey, name, color = CHART_COLORS.cyan, height = 260, layout = "horizontal" }: { data: Record<string, unknown>[]; xKey: string; yKey: string; name: string; color?: string | string[]; height?: number; layout?: "horizontal" | "vertical" }) {
  const vertical = layout === "vertical";
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ top: 4, right: 12, left: vertical ? 8 : 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={!vertical} vertical={vertical} />
          {vertical ? <XAxis type="number" {...axis} tickFormatter={(v: number) => fmtEur0(v)} /> : <XAxis dataKey={xKey} {...axis} />}
          {vertical ? <YAxis type="category" dataKey={xKey} {...axis} width={96} /> : <YAxis {...axis} width={64} tickFormatter={(v: number) => fmtEur0(v)} />}
          <Tooltip content={<GlassTooltip />} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
          <Bar dataKey={yKey} name={name} radius={vertical ? [2, 8, 8, 2] : [8, 8, 2, 2]} maxBarSize={vertical ? 22 : 38} animationDuration={900}>
            {data.map((_, i) => <Cell key={i} fill={Array.isArray(color) ? color[i % color.length] : color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, height = 240, centerLabel, centerValue }: { data: { name: string; value: number; color: string }[]; height?: number; centerLabel?: string; centerValue?: string }) {
  const visible = data.filter((d) => d.value > 0);
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer>
        <PieChart>
          <Tooltip content={<GlassTooltip />} />
          <Pie data={visible.length ? visible : [{ name: "No data", value: 1, color: "rgba(255,255,255,0.12)" }]} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="92%" paddingAngle={visible.length > 1 ? 3 : 0} stroke="none" animationDuration={1000}>
            {(visible.length ? visible : [{ color: "rgba(255,255,255,0.12)" }]).map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="num font-display text-lg font-semibold">{centerValue}</span>}
          {centerLabel && <span className="label mt-0.5">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}
