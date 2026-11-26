import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { CardHeader, GlassCard } from "../components/GlassCard";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useStore } from "../data/store";
import { CHANNELS, isCountedOrder, orderEconomics, orderUnits, productName, stockLevels, unitCosts } from "../lib/calc";
import { addDays, fmtDateShort, fmtEur, fmtPct, todayISO } from "../lib/format";

function weekStart(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return addDays(iso, -((d.getDay() + 6) % 7));
}

export function WeeklyReport() {
  const { db } = useStore();
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const start = addDays(weekStart(todayISO()), offset * 7);
  const end = addDays(start, 6);
  const prevStart = addDays(start, -7);

  const r = useMemo(() => {
    const costs = unitCosts(db);
    const inWeek = (d: string, a: string, b: string) => d >= a && d <= b;
    const week = db.orders.filter((o) => isCountedOrder(o) && inWeek(o.date, start, end));
    const prev = db.orders.filter((o) => isCountedOrder(o) && inWeek(o.date, prevStart, addDays(start, -1)));
    const sum = (os: typeof week) => os.reduce((a, o) => { const e = orderEconomics(o, db.settings, costs); return { gross: a.gross + e.gross, profit: a.profit + e.profit, units: a.units + orderUnits(o) }; }, { gross: 0, profit: 0, units: 0 });
    const w = sum(week), p = sum(prev);
    const byChannel = CHANNELS.map((c) => ({ c, n: week.filter((o) => o.channel === c).length, v: week.filter((o) => o.channel === c).reduce((s, o) => s + orderEconomics(o, db.settings, costs).gross, 0) })).filter((x) => x.n);
    const productUnits: Record<string, number> = {};
    week.forEach((o) => o.items.forEach((i) => (productUnits[i.productId] = (productUnits[i.productId] || 0) + i.qty)));
    const top = Object.entries(productUnits).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${productName(db.products.find((p) => p.id === id))} (${n})`);
    const exp = db.expenses.filter((e) => inWeek(e.date, start, end)).reduce((s, e) => s + e.amount, 0);
    const stock = stockLevels(db);
    const low = db.products.filter((p) => stock[p.id].state !== "ok" && stock[p.id].purchased + stock[p.id].adjusted > 0).map((p) => `${productName(p)}: ${stock[p.id].qty}`);
    const units = Object.values(stock).reduce((s, x) => s + Math.max(0, x.qty), 0);
    const incoming = db.shipments.filter((s) => s.status !== "Arrived").map((s) => `${s.reference} (${s.status}, ETA ${fmtDateShort(s.eta)})`);
    const nextWeekEnd = addDays(end, 7);
    const followUps = db.partners.filter((x) => x.nextFollowUp && x.nextFollowUp <= nextWeekEnd).sort((a, b) => a.nextFollowUp!.localeCompare(b.nextFollowUp!)).map((x) => `${x.name} — ${x.nextAction || "follow up"} (${fmtDateShort(x.nextFollowUp)}${x.nextFollowUp! < todayISO() ? ", overdue" : ""})`);
    const activities = db.partners.flatMap((x) => x.activities.filter((a) => inWeek(a.date, start, end)).map((a) => `${x.name}: ${a.text}`));
    const quotesSent = db.quotes.filter((q) => inWeek(q.date, start, end));
    const won = db.quotes.filter((q) => q.status === "Accepted" && inWeek(q.date, start, end));
    const tasksDone = db.tasks.filter((t) => t.done && t.due && inWeek(t.due, start, end)).length;
    const tasksOpen = db.tasks.filter((t) => !t.done).length;
    return { w, p, count: week.length, prevCount: prev.length, byChannel, top, exp, low, units, incoming, followUps, activities, quotesSent, won, tasksDone, tasksOpen };
  }, [db, start, end, prevStart]);

  const delta = (a: number, b: number) => (b ? ` (${a >= b ? "+" : "−"}${fmtPct(Math.abs(a - b) / Math.abs(b), 0)} vs previous week)` : "");
  const text = [
    `INNOMETRICS — WEEKLY REPORT`,
    `Week ${fmtDateShort(start)} – ${fmtDateShort(end)} ${end.slice(0, 4)}`,
    ``,
    `SALES`,
    `• Revenue: ${fmtEur(r.w.gross)}${delta(r.w.gross, r.p.gross)}`,
    `• Orders: ${r.count} · Units: ${r.w.units}${delta(r.count, r.prevCount)}`,
    ...r.byChannel.map((c) => `   – ${c.c}: ${c.n} orders · ${fmtEur(c.v)}`),
    r.top.length ? `• Best sellers: ${r.top.join(", ")}` : `• No sales recorded this week`,
    ``,
    `PROFIT`,
    `• Order profit after costs, Skroutz fee & VAT: ${fmtEur(r.w.profit)}${delta(r.w.profit, r.p.profit)}`,
    `• Expenses paid this week: ${fmtEur(r.exp)}`,
    ``,
    `STOCK`,
    `• Units in stock: ${r.units}`,
    r.low.length ? `• Low / out of stock: ${r.low.join("; ")}` : `• No low-stock SKUs`,
    r.incoming.length ? `• Incoming: ${r.incoming.join("; ")}` : `• No incoming shipments`,
    ``,
    `PARTNERS & B2B`,
    r.followUps.length ? `• Follow-ups due by ${fmtDateShort(addDays(end, 7))}:\n${r.followUps.map((f) => `   – ${f}`).join("\n")}` : `• No follow-ups due`,
    r.activities.length ? `• This week: ${r.activities.slice(0, 6).join("; ")}` : `• No partner activity logged`,
    `• Quotes created: ${r.quotesSent.length}${r.won.length ? ` · won: ${r.won.map((q) => q.client).join(", ")}` : ""}`,
    ``,
    `TASKS`,
    `• Completed: ${r.tasksDone} · Still open: ${r.tasksOpen}`,
  ].join("\n");

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast("Weekly report copied"); } catch { toast("Copy failed — select the text and copy it manually", "error"); }
  };

  return (
    <div>
      <PageHeader eyebrow="Command" title="Weekly Report" subtitle="Generated from your orders, stock, partners and tasks. Paste it into email, Slack or WhatsApp."
        actions={<>
          <div className="flex items-center gap-2">
            <button className="btn-ghost px-2" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week"><ChevronLeft size={16} /></button>
            <span className="w-40 text-center text-sm font-semibold">{fmtDateShort(start)} – {fmtDateShort(end)}</span>
            <button className="btn-ghost px-2" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)} aria-label="Next week"><ChevronRight size={16} /></button>
          </div>
          <button className="btn-primary" onClick={copy}><Copy size={16} /> Copy</button>
        </>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <GlassCard hover={false}>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-white/90">{text}</pre>
        </GlassCard>
        <div className="space-y-4">
          {[["Revenue", fmtEur(r.w.gross), r.p.gross ? (r.w.gross - r.p.gross) / r.p.gross : null], ["Order profit", fmtEur(r.w.profit), r.p.profit ? (r.w.profit - r.p.profit) / Math.abs(r.p.profit) : null], ["Orders", String(r.count), r.prevCount ? (r.count - r.prevCount) / r.prevCount : null]].map(([l, v, d]) => (
            <GlassCard key={l as string}>
              <CardHeader title={l as string} />
              <div className="num -mt-2 font-display text-2xl font-semibold">{v as string}</div>
              {d != null && <div className={`mt-1 text-xs font-semibold ${(d as number) >= 0 ? "text-glow-mint" : "text-glow-rose"}`}>{(d as number) >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(d as number), 0)} vs previous week</div>}
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  );
}
