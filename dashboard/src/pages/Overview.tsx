import { motion } from "framer-motion";
import { AlertTriangle, Boxes, ChevronRight, Euro, FileSpreadsheet, Handshake, MousePointerClick, PackageSearch, ShoppingBag, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { channelTone, Badge } from "../components/Badge";
import { BarLineChart, CHANNEL_COLORS, CHART_COLORS, DonutChart } from "../components/Charts";
import { Segmented } from "../components/Field";
import { CardHeader, GlassCard } from "../components/GlassCard";
import { StatsCard } from "../components/StatsCard";
import { useStore } from "../data/store";
import { attentionItems, CHANNELS, followUpDue, isCountedOrder, monthlyRows, orderEconomics, stockLevels, unitCosts } from "../lib/calc";
import { openNew } from "../lib/router";
import { fmtEur, fmtEur0, fmtPct, greeting, lastMonths, monthLabel, num0, todayISO } from "../lib/format";

const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };

export function Overview() {
  const { db } = useStore();
  const [range, setRange] = useState<"3" | "6" | "12">("6");
  const today = todayISO();
  const thisMonth = today.slice(0, 7);

  const data = useMemo(() => {
    const months12 = lastMonths(12, today);
    const rows = monthlyRows(db, months12);
    const cur = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const stock = stockLevels(db);
    const units = Object.values(stock).reduce((s, x) => s + Math.max(0, x.qty), 0);
    const low = db.products.filter((p) => stock[p.id].state !== "ok" && stock[p.id].purchased + stock[p.id].adjusted > 0).length;
    const openQuotes = db.quotes.filter((q) => q.status === "Draft" || q.status === "Sent");
    const due = db.partners.filter((p) => followUpDue(p, today));
    const sk = db.skroutzStats.find((s) => s.month === thisMonth);
    const skPrev = db.skroutzStats.find((s) => s.month === prev?.month);
    const conv = sk && sk.visits ? sk.orders / sk.visits : null;
    const convPrev = skPrev && skPrev.visits ? skPrev.orders / skPrev.visits : null;
    // A % change is only meaningful against a positive base (e.g. not when last month was a loss).
    const trend = (a: number, b: number | undefined) => (b != null && b > 0 ? (a - b) / b : null);
    return { rows, cur, prev, units, low, openQuotes, due, conv, convPrev, trend, stock, sk };
  }, [db, today, thisMonth]);

  const chartRows = data.rows.slice(-Number(range)).map((r) => ({ label: monthLabel(r.month, range === "12"), Skroutz: r.byChannel.Skroutz, Retail: r.byChannel.Retail, B2B: r.byChannel.B2B, Direct: r.byChannel.Direct, "Net profit": r.netProfit }));
  const rangeRows = data.rows.slice(-Number(range));
  const channelTotals = CHANNELS.map((c) => ({ name: c, value: rangeRows.reduce((s, r) => s + r.byChannel[c], 0), color: CHANNEL_COLORS[c] }));
  const rangeTotal = channelTotals.reduce((s, c) => s + c.value, 0);
  const attention = useMemo(() => attentionItems(db, today), [db, today]);
  const recent = useMemo(() => {
    const costs = unitCosts(db);
    return [...db.orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map((o) => ({ o, e: orderEconomics(o, db.settings, costs) }));
  }, [db]);

  const firstName = db.settings.userName.split(" ")[0];
  const dateText = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2 text-glow-cyan/80">{dateText}</div>
          <h1 className="heading text-2xl leading-tight sm:text-3xl">{greeting()}, {firstName}</h1>
          <p className="mt-2 text-sm text-white/65">
            {attention.length === 0 ? "Everything is on track today." : <><span className="font-semibold text-glow-amber">{attention.length} {attention.length === 1 ? "thing needs" : "things need"} your attention</span> — low stock, follow-ups and open items below.</>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openNew("orders")} className="btn-primary"><ShoppingBag size={16} /> Record order</button>
          <a href="#report" className="btn-ghost">Weekly report</a>
        </div>
      </div>

      <motion.div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" initial="hidden" animate="show" transition={{ staggerChildren: 0.05 }}>
        {[
          <StatsCard label="Revenue this month" value={data.cur.revenue} format={fmtEur0} icon={Euro} tone="cyan" trend={data.trend(data.cur.revenue, data.prev?.revenue) != null ? { value: data.trend(data.cur.revenue, data.prev?.revenue)!, label: "vs last month" } : null} hint="incl. VAT" href="#finance" />,
          <StatsCard label="Net profit" value={data.cur.netProfit} format={fmtEur0} icon={TrendingUp} tone={data.cur.netProfit >= 0 ? "mint" : "rose"} trend={data.trend(data.cur.netProfit, data.prev?.netProfit) != null ? { value: data.trend(data.cur.netProfit, data.prev?.netProfit)!, label: "vs last month" } : null} href="#finance" />,
          <StatsCard label="Orders" value={data.cur.orders} format={(v) => num0.format(v)} icon={ShoppingBag} tone="violet" trend={data.trend(data.cur.orders, data.prev?.orders) != null ? { value: data.trend(data.cur.orders, data.prev?.orders)!, label: "vs last month" } : null} href="#orders" />,
          <StatsCard label="Units in stock" value={data.units} format={(v) => num0.format(v)} icon={Boxes} tone="cyan" hint={`${db.products.length} SKUs`} href="#inventory" />,
          <StatsCard label="Low-stock alerts" value={data.low} format={(v) => num0.format(v)} icon={AlertTriangle} tone={data.low ? "amber" : "mint"} hint={data.low ? "SKUs at or below threshold" : "All SKUs healthy"} href="#inventory" />,
          <StatsCard label="Open B2B quotes" value={data.openQuotes.length} format={(v) => num0.format(v)} icon={FileSpreadsheet} tone="violet" hint={`${fmtEur0(data.openQuotes.reduce((s, q) => s + q.lines.reduce((x, l) => x + l.qty * l.unitPrice, 0), 0))} pipeline`} href="#quotes" />,
          <StatsCard label="Follow-ups due" value={data.due.length} format={(v) => num0.format(v)} icon={Handshake} tone={data.due.length ? "rose" : "mint"} hint={data.due.length ? data.due.map((p) => p.name).slice(0, 2).join(", ") : "Nothing due"} href="#partners" />,
          <StatsCard label="Skroutz conversion" value={data.conv ?? 0} format={(v) => (data.conv == null ? "—" : fmtPct(v, 2))} icon={MousePointerClick} tone="amber" trend={data.conv != null && data.convPrev ? { value: (data.conv - data.convPrev) / data.convPrev, label: "vs last month" } : null} hint={data.sk ? `${num0.format(data.sk.orders)} orders / ${num0.format(data.sk.visits)} visits` : "Add monthly Skroutz visits to track"} />,
        ].map((card, i) => <motion.div key={i} variants={item}>{card}</motion.div>)}
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-3">
        <GlassCard className="xl:col-span-2" hover={false}>
          <CardHeader title="Revenue by month" subtitle="By channel, incl. VAT · line shows net profit after costs and operating expenses"
            action={<Segmented value={range} onChange={setRange} options={[{ value: "3", label: "3M" }, { value: "6", label: "6M" }, { value: "12", label: "12M" }]} />} />
          <BarLineChart data={chartRows} xKey="label" height={300}
            series={[
              { key: "Skroutz", name: "Skroutz", color: CHANNEL_COLORS.Skroutz, stack: "rev" },
              { key: "Retail", name: "Retail", color: CHANNEL_COLORS.Retail, stack: "rev" },
              { key: "B2B", name: "B2B", color: CHANNEL_COLORS.B2B, stack: "rev" },
              { key: "Direct", name: "Direct", color: CHANNEL_COLORS.Direct, stack: "rev" },
              { key: "Net profit", name: "Net profit", color: CHART_COLORS.mint, type: "line" },
            ]} />
        </GlassCard>
        <GlassCard hover={false}>
          <CardHeader title="Revenue by channel" subtitle={`Last ${range} months`} />
          <DonutChart data={channelTotals} height={220} centerValue={fmtEur0(rangeTotal)} centerLabel="Total" />
          <ul className="mt-4 space-y-2.5">
            {channelTotals.map((c) => (
              <li key={c.name} className="flex items-center gap-3 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                <span className="flex-1 text-white/80">{c.name}</span>
                <span className="num text-white/55">{rangeTotal ? fmtPct(c.value / rangeTotal, 0) : "—"}</span>
                <span className="num w-24 text-right font-semibold">{fmtEur0(c.value)}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <GlassCard className="xl:col-span-2" hover={false}>
          <CardHeader title="Needs your attention" subtitle={`${attention.length} open items`} />
          {attention.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/55">All clear.</p>
          ) : (
            <ul className="-mx-2 space-y-1">
              {attention.slice(0, 7).map((a) => (
                <li key={a.id}>
                  <a href={a.href} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.06]">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${a.severity === "high" ? "bg-glow-rose/15 text-glow-rose" : "bg-glow-amber/15 text-glow-amber"}`}>
                      {a.kind === "stock" ? <PackageSearch size={15} /> : a.kind === "followup" ? <Handshake size={15} /> : <AlertTriangle size={15} />}
                    </span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{a.title}</span><span className="block truncate text-xs text-white/50">{a.detail}</span></span>
                    <ChevronRight size={16} className="text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
        <GlassCard className="xl:col-span-3" hover={false}>
          <CardHeader title="Latest orders" subtitle="Profit after product cost, shipping, Skroutz fee and VAT" action={<a href="#orders" className="text-xs font-semibold text-glow-cyan hover:underline">View all</a>} />
          <ul className="divide-y divide-white/[0.06]">
            {recent.map(({ o, e }) => (
              <li key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Badge tone={channelTone[o.channel]}>{o.channel}</Badge>
                <span className="min-w-0 flex-1 truncate"><span className="text-white">{o.customer}</span> <span className="text-white/45">· {o.number}</span></span>
                <span className="num hidden w-24 text-right text-white/70 sm:block">{fmtEur(e.gross)}</span>
                <span className={`num w-24 text-right font-semibold ${!isCountedOrder(o) ? "text-white/40 line-through" : e.profit >= 0 ? "text-glow-mint" : "text-glow-rose"}`}>{fmtEur(e.profit)}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>
    </div>
  );
}
