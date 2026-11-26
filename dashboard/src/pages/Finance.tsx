import { Download, Plus, Receipt, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../components/Badge";
import { BarLineChart, CHART_COLORS, SimpleBarChart } from "../components/Charts";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { Field, Segmented } from "../components/Field";
import { CardHeader, GlassCard } from "../components/GlassCard";
import { ConfirmModal, Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { StatsCard } from "../components/StatsCard";
import { useToast } from "../components/Toast";
import { useStore } from "../data/store";
import type { Expense, ExpenseCategory } from "../data/types";
import { EXPENSE_CATEGORIES, expensesByCategory, monthlyRows } from "../lib/calc";
import { downloadFile, fmtDate, fmtEur, fmtEur0, lastMonths, monthLabel, parseAmount, signedEur, toCsv, todayISO, uid } from "../lib/format";
import { Euro, Landmark, PiggyBank, Wallet } from "lucide-react";

const CAT_COLORS = [CHART_COLORS.violet, CHART_COLORS.amber, CHART_COLORS.cyan, CHART_COLORS.pink, CHART_COLORS.mint, CHART_COLORS.blue, CHART_COLORS.rose, CHART_COLORS.grey, "#8FE3D0"];

export function Finance() {
  const { db, remove } = useStore();
  const toast = useToast();
  const [range, setRange] = useState<"6" | "12" | "ytd">("12");
  const [catFilter, setCatFilter] = useState<"All" | ExpenseCategory>("All");
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Expense | null>(null);

  const months = useMemo(() => {
    const today = todayISO();
    if (range === "ytd") return lastMonths(Number(today.slice(5, 7)), today);
    return lastMonths(Number(range), today);
  }, [range]);
  const rows = useMemo(() => monthlyRows(db, months), [db, months]);
  const inRange = (d: string) => d.slice(0, 7) >= months[0] && d.slice(0, 7) <= months[months.length - 1];
  const expenses = db.expenses.filter((e) => inRange(e.date));
  const byCat = expensesByCategory(expenses).sort((a, b) => b.amount - a.amount);
  const T = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, expenses: a.expenses + r.expenses, cash: a.cash + r.cashResult, profit: a.profit + r.netProfit, opex: a.opex + r.opex }), { revenue: 0, expenses: 0, cash: 0, profit: 0, opex: 0 });

  const chart = rows.map((r) => ({ label: monthLabel(r.month, months.length > 6), Income: r.revenue, Expenses: r.expenses, "Net profit": r.netProfit }));
  const list = expenses.filter((e) => catFilter === "All" || e.category === catFilter);

  const exportCsv = () => {
    const summary = [["Month", "Income incl. VAT", "Expenses", "Cash result", "Order profit", "Operating expenses", "Net profit"], ...rows.map((r) => [r.month, r.revenue.toFixed(2), r.expenses.toFixed(2), r.cashResult.toFixed(2), r.orderProfit.toFixed(2), r.opex.toFixed(2), r.netProfit.toFixed(2)])];
    const detail = [[], ["Date", "Category", "Description", "Supplier", "Amount"], ...expenses.map((e) => [e.date, e.category, e.description, e.supplier, e.amount.toFixed(2)])];
    downloadFile(`innometrics-finance-${months[0]}_${months[months.length - 1]}.csv`, toCsv([...summary, ...detail]));
    toast("Finance exported to CSV");
  };

  const cols: Column<Expense>[] = [
    { key: "date", header: "Date", render: (e) => fmtDate(e.date), sortValue: (e) => e.date },
    { key: "cat", header: "Category", render: (e) => <Badge tone="violet">{e.category}</Badge>, sortValue: (e) => e.category },
    { key: "desc", header: "Description", render: (e) => <span><span className="block max-w-[260px] truncate">{e.description || "—"}</span><span className="text-xs text-white/45">{e.supplier}</span></span> },
    { key: "amt", header: "Amount", align: "right", render: (e) => <span className="font-semibold">{fmtEur(e.amount)}</span>, sortValue: (e) => e.amount },
    { key: "del", header: "", align: "right", render: (e) => <button className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-glow-rose" aria-label="Delete expense" onClick={() => setToDelete(e)}><Trash2 size={15} /></button> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operations" title="Finance" subtitle="Income vs expenses, where the money goes, and profit per month."
        actions={<><Segmented value={range} onChange={setRange} options={[{ value: "6", label: "6M" }, { value: "12", label: "12M" }, { value: "ytd", label: "YTD" }]} /><button className="btn-ghost" onClick={exportCsv}><Download size={16} /> Export CSV</button><button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add expense</button></>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatsCard label="Income" value={T.revenue} format={fmtEur0} icon={Euro} tone="cyan" hint="Orders incl. VAT" />
        <StatsCard label="Expenses" value={T.expenses} format={fmtEur0} icon={Wallet} tone="rose" hint={`${expenses.length} entries incl. stock purchases`} />
        <StatsCard label="Cash result" value={T.cash} format={fmtEur0} icon={Landmark} tone={T.cash >= 0 ? "mint" : "rose"} hint="Income − all expenses" />
        <StatsCard label="Net profit" value={T.profit} format={fmtEur0} icon={PiggyBank} tone={T.profit >= 0 ? "mint" : "rose"} hint="Order profit − operating costs" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <GlassCard className="xl:col-span-2" hover={false}>
          <CardHeader title="Income vs expenses" subtitle="Bars incl. VAT · line = net profit (order profit after cost of goods, minus operating expenses)" />
          <BarLineChart data={chart} xKey="label" height={300} series={[{ key: "Income", name: "Income", color: CHART_COLORS.cyan }, { key: "Expenses", name: "Expenses", color: CHART_COLORS.rose }, { key: "Net profit", name: "Net profit", color: CHART_COLORS.mint, type: "line" }]} />
        </GlassCard>
        <GlassCard hover={false}>
          <CardHeader title="Expenses by category" subtitle={fmtEur0(T.expenses)} />
          {byCat.length ? <SimpleBarChart data={byCat} xKey="category" yKey="amount" name="Spent" layout="vertical" height={Math.max(200, byCat.length * 38)} color={CAT_COLORS} /> : <EmptyState icon={Receipt} title="No expenses" />}
        </GlassCard>
      </div>

      <GlassCard hover={false}>
        <CardHeader title="Monthly profit" subtitle="Merchandise purchases are excluded from operating costs because they reach profit as product cost when sold." />
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-white/10">{["Month", "Income", "Expenses", "Cash result", "Order profit", "Operating costs", "Net profit"].map((h, i) => <th key={h} className={`label px-5 py-3 ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.month} className="border-b border-white/[0.06] hover:bg-white/[0.04]">
                  <td className="px-5 py-2.5">{monthLabel(r.month, true)}</td>
                  <td className="num px-5 text-right">{fmtEur0(r.revenue)}</td>
                  <td className="num px-5 text-right text-white/70">{fmtEur0(r.expenses)}</td>
                  <td className={`num px-5 text-right ${r.cashResult >= 0 ? "text-glow-mint" : "text-glow-rose"}`}>{signedEur(Math.round(r.cashResult))}</td>
                  <td className="num px-5 text-right text-white/70">{fmtEur0(r.orderProfit)}</td>
                  <td className="num px-5 text-right text-white/70">{fmtEur0(r.opex)}</td>
                  <td className={`num px-5 text-right font-semibold ${r.netProfit >= 0 ? "text-glow-mint" : "text-glow-rose"}`}>{signedEur(Math.round(r.netProfit))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="font-semibold"><td className="px-5 py-3">Total</td><td className="num px-5 text-right">{fmtEur0(T.revenue)}</td><td className="num px-5 text-right">{fmtEur0(T.expenses)}</td><td className="num px-5 text-right">{signedEur(Math.round(T.cash))}</td><td className="num px-5 text-right">{fmtEur0(T.profit + T.opex)}</td><td className="num px-5 text-right">{fmtEur0(T.opex)}</td><td className={`num px-5 text-right ${T.profit >= 0 ? "text-glow-mint" : "text-glow-rose"}`}>{signedEur(Math.round(T.profit))}</td></tr></tfoot>
          </table>
        </div>
      </GlassCard>

      <GlassCard hover={false}>
        <CardHeader title="Expenses" subtitle={`${list.length} entries in range`} action={<select className="input w-auto" value={catFilter} onChange={(e) => setCatFilter(e.target.value as typeof catFilter)} aria-label="Category"><option value="All">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>} />
        <DataTable rows={list} columns={cols} rowKey={(e) => e.id} initialSort={{ key: "date", dir: "desc" }} pageSize={15}
          empty={<EmptyState icon={Receipt} title="No expenses in this range" action={<button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add expense</button>} />} />
      </GlassCard>

      <ExpenseModal open={adding} onClose={() => setAdding(false)} />
      <ConfirmModal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete expense?" text={toDelete ? `${toDelete.category} · ${fmtEur(toDelete.amount)} on ${fmtDate(toDelete.date)}` : ""} onConfirm={() => { if (toDelete) { remove("expenses", toDelete.id); toast("Expense deleted", "info"); } }} />
    </div>
  );
}

function ExpenseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { upsert } = useStore();
  const toast = useToast();
  const [d, setD] = useState({ date: todayISO(), category: "Marketing" as ExpenseCategory, description: "", supplier: "", amount: "" });
  const [err, setErr] = useState("");
  const save = () => {
    const a = parseAmount(d.amount);
    if (a == null || Number.isNaN(a) || a <= 0) return setErr("Amount must be above 0, e.g. 120,50.");
    upsert("expenses", { id: uid("exp"), date: d.date, category: d.category, description: d.description.trim(), supplier: d.supplier.trim(), amount: Math.round(a * 100) / 100 });
    toast(`Expense added · ${fmtEur(a)}`);
    setD({ ...d, description: "", supplier: "", amount: "" }); setErr(""); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Add expense" subtitle="Amount incl. VAT"
      footer={<>{err && <span className="text-sm text-glow-rose">{err}</span>}<button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Add expense</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date"><input type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
        <Field label="Amount (€)"><input className="input" inputMode="decimal" placeholder="120,50" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></Field>
        <Field label="Category" className="sm:col-span-2"><select className="input" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as ExpenseCategory })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Description"><input className="input" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        <Field label="Supplier / invoice"><input className="input" value={d.supplier} onChange={(e) => setD({ ...d, supplier: e.target.value })} /></Field>
      </div>
      {d.category === "Merchandise" && <p className="mt-4 rounded-lg bg-glow-cyan/10 p-3 text-xs text-glow-cyan">Tip: to add the units to stock as well, use Inventory → Receive on the product.</p>}
    </Modal>
  );
}
