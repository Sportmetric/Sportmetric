import { Download, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, channelTone, statusTone } from "../components/Badge";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { Field, Segmented } from "../components/Field";
import { GlassCard } from "../components/GlassCard";
import { ConfirmModal, Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useStore } from "../data/store";
import type { Channel, Order, OrderItem, OrderStatus, Product, Settings } from "../data/types";
import { CHANNELS, isCountedOrder, orderEconomics, orderUnits, productName, stockLevels, unitCosts } from "../lib/calc";
import { addDays, downloadFile, fmtDate, fmtEur, fmtPct, parseAmount, toCsv, todayISO, uid } from "../lib/format";
import { consumeNewFlag } from "../lib/router";

const STATUSES: OrderStatus[] = ["Pending", "Paid", "Shipped", "Delivered", "Returned", "Cancelled"];

export function defaultPrice(p: Product | undefined, channel: Channel) {
  if (!p) return 0;
  if (channel === "Skroutz") return p.skroutzPrice ?? p.retailPrice ?? 0;
  if (channel === "Retail" || channel === "B2B") return p.wholesalePrice ?? p.retailPrice ?? 0;
  return p.retailPrice ?? p.skroutzPrice ?? 0;
}

export function Orders() {
  const { db, remove } = useStore();
  const [channel, setChannel] = useState<"All" | Channel>("All");
  const [status, setStatus] = useState<"All" | OrderStatus>("All");
  const [period, setPeriod] = useState<"30" | "90" | "365" | "all">("90");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(() => { if (consumeNewFlag()) setCreating(true); }, []);

  const costs = useMemo(() => unitCosts(db), [db]);
  const rows = useMemo(() => {
    const from = period === "all" ? "" : addDays(todayISO(), -Number(period));
    const term = q.trim().toLowerCase();
    return db.orders
      .filter((o) => (channel === "All" || o.channel === channel) && (status === "All" || o.status === status) && o.date >= from && (!term || `${o.number} ${o.customer}`.toLowerCase().includes(term)))
      .map((o) => ({ o, e: orderEconomics(o, db.settings, costs) }));
  }, [db, channel, status, period, q, costs]);

  const counted = rows.filter((r) => isCountedOrder(r.o));
  const tot = counted.reduce((a, { e }) => ({ gross: a.gross + e.gross, profit: a.profit + e.profit, net: a.net + e.net }), { gross: 0, profit: 0, net: 0 });

  const cols: Column<(typeof rows)[number]>[] = [
    { key: "date", header: "Date", render: ({ o }) => <span className="text-white/80">{fmtDate(o.date)}</span>, sortValue: ({ o }) => o.date },
    { key: "num", header: "Order", render: ({ o }) => <span className="font-medium">{o.number}</span>, sortValue: ({ o }) => o.number, hideOnMobile: true },
    { key: "cust", header: "Customer", render: ({ o }) => <span><span className="block max-w-[200px] truncate">{o.customer}</span><span className="text-xs text-white/45">{orderUnits(o)} units · {o.items.map((i) => db.products.find((p) => p.id === i.productId)?.model).filter(Boolean).join(", ")}</span></span>, sortValue: ({ o }) => o.customer },
    { key: "ch", header: "Channel", render: ({ o }) => <Badge tone={channelTone[o.channel]}>{o.channel}</Badge>, sortValue: ({ o }) => o.channel },
    { key: "st", header: "Status", render: ({ o }) => <Badge tone={statusTone[o.status]} dot>{o.status}</Badge>, sortValue: ({ o }) => o.status },
    { key: "gross", header: "Total", align: "right", render: ({ e }) => fmtEur(e.gross), sortValue: ({ e }) => e.gross },
    { key: "cost", header: "Costs", align: "right", hideOnMobile: true, render: ({ e }) => <span className="text-white/60" title={`Product ${fmtEur(e.productCost)} · Shipping ${fmtEur(e.shipping)} · Skroutz ${fmtEur(e.commission)} · VAT ${fmtEur(e.vat)}`}>{fmtEur(e.productCost + e.shipping + e.commission + e.vat)}</span>, sortValue: ({ e }) => e.productCost + e.shipping + e.commission },
    {
      key: "profit", header: "Profit", align: "right", sortValue: ({ e }) => e.profit,
      render: ({ o, e }) => (
        <span className={`font-semibold ${!isCountedOrder(o) ? "text-white/40 line-through" : e.profit >= 0 ? "text-glow-mint" : "text-glow-rose"}`}>
          {fmtEur(e.profit)}<span className="block text-[11px] font-normal text-white/45">{e.missingCost ? "cost missing" : fmtPct(e.margin, 0)}</span>
        </span>
      ),
    },
  ];

  const exportCsv = () => {
    const header = ["Date", "Order", "Customer", "Channel", "Status", "Units", "Total incl. VAT", "Net of VAT", "Skroutz fee", "Product cost", "Shipping", "Profit"];
    const body = rows.map(({ o, e }) => [o.date, o.number, o.customer, o.channel, o.status, orderUnits(o), e.gross.toFixed(2), e.net.toFixed(2), e.commission.toFixed(2), e.productCost.toFixed(2), e.shipping.toFixed(2), e.profit.toFixed(2)]);
    downloadFile(`innometrics-orders-${todayISO()}.csv`, toCsv([header, ...body]));
    toast("Orders exported to CSV");
  };

  return (
    <div>
      <PageHeader eyebrow="Sales" title="Orders" subtitle="Profit per order after product cost, shipping, Skroutz commission and VAT."
        actions={<><button className="btn-ghost" onClick={exportCsv}><Download size={16} /> CSV</button><button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Record an order</button></>} />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Summary label="Revenue (filtered)" value={fmtEur(tot.gross)} />
        <Summary label="Profit" value={fmtEur(tot.profit)} tone={tot.profit >= 0 ? "text-glow-mint" : "text-glow-rose"} />
        <Summary label="Avg. margin on net" value={tot.net ? fmtPct(tot.profit / tot.net, 1) : "—"} />
      </div>

      <GlassCard hover={false}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented value={channel} onChange={setChannel} options={[{ value: "All", label: "All" }, ...CHANNELS.map((c) => ({ value: c, label: c }))]} />
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
            <option value="All">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} aria-label="Date range">
            <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="all">All time</option>
          </select>
          <input className="input sm:ml-auto sm:w-56" placeholder="Search customer or #" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        </div>
        <DataTable rows={rows} columns={cols} rowKey={({ o }) => o.id} onRowClick={({ o }) => setEditing(o)} initialSort={{ key: "date", dir: "desc" }}
          empty={<EmptyState icon={ShoppingBag} title="No orders match" text="Change the filters or record a new order." action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Record an order</button>} />} />
      </GlassCard>

      <OrderModal open={creating || !!editing} order={editing} onClose={() => { setCreating(false); setEditing(null); }}
        onDeleted={(o) => { remove("orders", o.id); toast(`Order ${o.number} deleted`, "info"); }} />
    </div>
  );
}

function Summary({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="glass-soft px-4 py-3">
      <div className="label">{label}</div>
      <div className={`num mt-1 font-display text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function nextOrderNumber(orders: Order[]) {
  const max = orders.reduce((m, o) => Math.max(m, Number(o.number.replace(/\D/g, "")) || 0), 1000);
  return `IM-${max + 1}`;
}

function OrderModal({ open, order, onClose, onDeleted }: { open: boolean; order: Order | null; onClose: () => void; onDeleted: (o: Order) => void }) {
  const { db, upsert } = useStore();
  const toast = useToast();
  const blank = (): Order => ({ id: uid("ord"), number: nextOrderNumber(db.orders), date: todayISO(), channel: "Skroutz", customer: "", status: "Paid", items: [{ productId: db.products[0]?.id ?? "", qty: 1, unitPrice: defaultPrice(db.products[0], "Skroutz") }], shippingCost: 0, costOverride: null, notes: "" });
  const [draft, setDraft] = useState<Order>(blank);
  const [shipText, setShipText] = useState("0");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = order ? structuredClone(order) : blank();
    setDraft(d);
    setShipText(String(d.shippingCost).replace(".", ","));
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order]);

  const costs = useMemo(() => unitCosts(db), [db]);
  const stock = useMemo(() => stockLevels(db), [db]);
  const e = orderEconomics({ ...draft, shippingCost: parseAmount(shipText) || 0 }, db.settings, costs);
  const set = <K extends keyof Order>(k: K, v: Order[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setItem = (i: number, patch: Partial<OrderItem>) => setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const changeChannel = (c: Channel) => setDraft((d) => ({ ...d, channel: c, items: d.items.map((it) => ({ ...it, unitPrice: defaultPrice(db.products.find((p) => p.id === it.productId), c) })) }));

  const save = () => {
    const ship = parseAmount(shipText);
    if (!draft.customer.trim()) return setError("Add the customer name.");
    if (!draft.items.length || draft.items.some((i) => !i.productId || !(i.qty > 0) || !Number.isInteger(i.qty))) return setError("Every line needs a product and a whole quantity above 0.");
    if (draft.items.some((i) => !(i.unitPrice >= 0))) return setError("Prices must be 0 or more.");
    if (ship == null || Number.isNaN(ship) || ship < 0) return setError("Shipping must be a number, e.g. 3,20.");
    upsert("orders", { ...draft, customer: draft.customer.trim(), shippingCost: ship });
    toast(order ? `Order ${draft.number} updated` : `Order ${draft.number} recorded · profit ${fmtEur(e.profit)}`);
    onClose();
  };

  return (
    <>
      <Modal open={open} onClose={onClose} size="xl" title={order ? `Order ${draft.number}` : "Record an order"} subtitle="Prices incl. VAT. Profit updates as you type."
        footer={<>
          {order && <button className="btn-danger mr-auto" onClick={() => setConfirm(true)}><Trash2 size={15} /> Delete</button>}
          {error && <span className="text-sm text-glow-rose">{error}</span>}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>{order ? "Save changes" : "Record order"}</button>
        </>}>
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Date"><input type="date" className="input" value={draft.date} onChange={(ev) => set("date", ev.target.value)} /></Field>
              <Field label="Order #"><input className="input" value={draft.number} onChange={(ev) => set("number", ev.target.value)} /></Field>
              <Field label="Status"><select className="input" value={draft.status} onChange={(ev) => set("status", ev.target.value as OrderStatus)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            </div>
            <Field label="Channel"><Segmented value={draft.channel} onChange={changeChannel} options={CHANNELS.map((c) => ({ value: c, label: c }))} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer"><input className="input" value={draft.customer} placeholder={draft.channel === "Skroutz" ? "Skroutz customer name" : "Company or person"} onChange={(ev) => set("customer", ev.target.value)} list="customers" /></Field>
              <Field label="Linked partner (optional)">
                <select className="input" value={draft.partnerId ?? ""} onChange={(ev) => { const p = db.partners.find((x) => x.id === ev.target.value); setDraft((d) => ({ ...d, partnerId: p?.id, customer: d.customer || p?.name || "" })); }}>
                  <option value="">None</option>{db.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <datalist id="customers">{[...new Set(db.orders.map((o) => o.customer))].slice(0, 200).map((c) => <option key={c} value={c} />)}</datalist>
            </div>

            <div>
              <div className="label mb-2">Products</div>
              <div className="space-y-2">
                {draft.items.map((it, i) => {
                  const p = db.products.find((x) => x.id === it.productId);
                  return (
                    <div key={i} className="glass-soft grid grid-cols-[1fr_72px_100px_32px] items-center gap-2 p-2">
                      <select className="input" value={it.productId} aria-label="Product" onChange={(ev) => setItem(i, { productId: ev.target.value, unitPrice: defaultPrice(db.products.find((x) => x.id === ev.target.value), draft.channel) })}>
                        {db.products.map((x) => <option key={x.id} value={x.id}>{productName(x)} · {stock[x.id]?.qty ?? 0} in stock</option>)}
                      </select>
                      <input className="input text-right" inputMode="numeric" aria-label="Quantity" value={it.qty} onChange={(ev) => setItem(i, { qty: Math.max(0, Math.floor(Number(ev.target.value) || 0)) })} />
                      <input className="input text-right" inputMode="decimal" aria-label="Unit price incl. VAT" value={String(it.unitPrice).replace(".", ",")} onChange={(ev) => setItem(i, { unitPrice: parseAmount(ev.target.value) ?? 0 })} />
                      <button className="grid h-9 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-glow-rose disabled:opacity-30" disabled={draft.items.length === 1} aria-label="Remove line" onClick={() => set("items", draft.items.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
                      {p && stock[p.id] && it.qty > stock[p.id].qty && !order && <span className="col-span-4 px-1 text-xs text-glow-amber">Only {Math.max(0, stock[p.id].qty)} in stock</span>}
                    </div>
                  );
                })}
              </div>
              <button className="btn-ghost mt-2 text-xs" onClick={() => set("items", [...draft.items, { productId: db.products[0]?.id ?? "", qty: 1, unitPrice: defaultPrice(db.products[0], draft.channel) }])}><Plus size={14} /> Add product</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Shipping cost paid by us (€)"><input className="input" inputMode="decimal" value={shipText} onChange={(ev) => setShipText(ev.target.value)} /></Field>
              <Field label="Product cost override (€, optional)" hint="Leave empty to use average purchase cost">
                <input className="input" inputMode="decimal" value={draft.costOverride == null ? "" : String(draft.costOverride).replace(".", ",")} onChange={(ev) => { const v = parseAmount(ev.target.value); set("costOverride", v == null || Number.isNaN(v) ? null : v); }} />
              </Field>
            </div>
            <Field label="Notes"><textarea className="input min-h-[70px]" value={draft.notes ?? ""} onChange={(ev) => set("notes", ev.target.value)} /></Field>
          </div>

          <ProfitBreakdown e={e} settings={db.settings} channel={draft.channel} />
        </div>
      </Modal>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Delete this order?" text={`Order ${draft.number} for ${draft.customer || "this customer"} will be removed and its units return to stock.`}
        onConfirm={() => { if (order) onDeleted(order); onClose(); }} />
    </>
  );
}

function ProfitBreakdown({ e, settings, channel }: { e: ReturnType<typeof orderEconomics>; settings: Settings; channel: Channel }) {
  const Row = ({ label, value, minus, strong }: { label: string; value: number; minus?: boolean; strong?: boolean }) => (
    <div className={`flex items-center justify-between py-1.5 ${strong ? "border-t border-white/15 pt-3 font-semibold" : "text-white/75"}`}>
      <span>{label}</span><span className="num">{minus && value ? "−" : ""}{fmtEur(value)}</span>
    </div>
  );
  return (
    <div className="glass-soft h-fit p-4 text-sm lg:sticky lg:top-0">
      <div className="label mb-3">Profit breakdown</div>
      <Row label="Total incl. VAT" value={e.gross} />
      <Row label={`VAT ${Math.round(settings.vatRate * 100)}%`} value={e.vat} minus />
      <Row label="Net revenue" value={e.net} strong />
      {channel === "Skroutz" && <Row label={`Skroutz fee ${(settings.skroutzCommission * 100).toFixed(2)}%`} value={e.commission} minus />}
      <Row label="Product cost" value={e.productCost} minus />
      <Row label="Shipping" value={e.shipping} minus />
      <div className="mt-2 flex items-center justify-between border-t border-white/15 pt-3">
        <span className="heading text-xs">Profit</span>
        <span className={`num font-display text-xl font-semibold ${e.profit >= 0 ? "text-glow-mint" : "text-glow-rose"}`}>{fmtEur(e.profit)}</span>
      </div>
      <div className="mt-1 text-right text-xs text-white/50">{fmtPct(e.margin, 1)} of net revenue</div>
      {e.missingCost && <p className="mt-3 rounded-lg bg-glow-amber/10 p-2 text-xs text-glow-amber">Some products have no cost yet. Add it in Inventory for an accurate profit.</p>}
    </div>
  );
}
