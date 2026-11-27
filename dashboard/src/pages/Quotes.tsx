import { FileDown, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { isArtifact, saveFile } from "../lib/platform";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { Field, Segmented } from "../components/Field";
import { GlassCard } from "../components/GlassCard";
import { ConfirmModal, Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useStore } from "../data/store";
import type { Database, Quote, QuoteStatus, Settings, Product } from "../data/types";
import { productName, quoteTotals } from "../lib/calc";
import { addDays, fmtDate, fmtEur, fmtEur0, parseAmount, todayISO, uid } from "../lib/format";
import { useNewAction } from "../lib/router";

const STATUSES: QuoteStatus[] = ["Draft", "Sent", "Accepted", "Lost"];
const exVat = (p: Product | undefined, s: Settings) => {
  const gross = p?.wholesalePrice ?? p?.retailPrice ?? 0;
  return Math.round((gross / (1 + s.vatRate)) * 100) / 100;
};

export function Quotes() {
  const { db, upsert } = useStore();
  const toast = useToast();
  const [filter, setFilter] = useState<"All" | QuoteStatus>("All");
  const [editing, setEditing] = useState<Quote | null>(null);
  const [creating, setCreating] = useState(false);
  const [printing, setPrinting] = useState<Quote | null>(null);

  useNewAction("quotes", () => setCreating(true));
  useEffect(() => {
    if (!printing) return;
    if (isArtifact()) {
      // claude.ai pages cannot open the print dialog: download a print-ready page instead.
      const q = printing;
      setPrinting(null);
      const body = renderToStaticMarkup(<PrintableQuote q={q} db={db} standalone />);
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${q.number} · ${q.client.replace(/[<>&]/g, "")}</title><style>@page{size:A4;margin:14mm}body{margin:0;padding:24px;background:#fff}@media print{body{padding:0}}</style></head><body onload="setTimeout(function(){window.print()},300)">${body}</body></html>`;
      saveFile(`${q.number}.html`, html, "text/html;charset=utf-8").then((ok) =>
        toast(ok ? "Quote downloaded — open the file and choose Save as PDF" : "Download was blocked. PDF export works in the local version.", ok ? "success" : "error"));
      return;
    }
    const t = setTimeout(() => { window.print(); setPrinting(null); }, 120);
    return () => clearTimeout(t);
  }, [printing, db, toast]);

  const rows = db.quotes.filter((q) => filter === "All" || q.status === filter).map((q) => ({ q, t: quoteTotals(q, db.settings) }));
  const sum = (st: QuoteStatus[]) => db.quotes.filter((q) => st.includes(q.status)).reduce((s, q) => s + quoteTotals(q, db.settings).total, 0);
  const decided = db.quotes.filter((q) => q.status === "Accepted" || q.status === "Lost");
  const winRate = decided.length ? db.quotes.filter((q) => q.status === "Accepted").length / decided.length : null;

  const cols: Column<(typeof rows)[number]>[] = [
    { key: "num", header: "Quote", render: ({ q }) => <span><span className="font-semibold">{q.number}</span><span className="block text-xs text-white/45">{fmtDate(q.date)}</span></span>, sortValue: ({ q }) => q.date },
    { key: "client", header: "Client", render: ({ q, t }) => <span><span className="block">{q.client}</span><span className="text-xs text-white/45">{t.units} units{q.customLogo ? " · custom logo" : ""}</span></span>, sortValue: ({ q }) => q.client },
    { key: "valid", header: "Valid until", hideOnMobile: true, render: ({ q }) => <span className={q.status === "Sent" && q.validUntil < todayISO() ? "text-glow-rose" : "text-white/70"}>{fmtDate(q.validUntil)}</span>, sortValue: ({ q }) => q.validUntil },
    {
      key: "status", header: "Status", sortValue: ({ q }) => q.status,
      render: ({ q }) => (
        <select onClick={(e) => e.stopPropagation()} value={q.status} aria-label="Status" onChange={(e) => { upsert("quotes", { ...q, status: e.target.value as QuoteStatus }); toast(`${q.number} marked ${e.target.value}`); }}
          className="rounded-full border border-white/15 bg-white/[0.07] px-2 py-1 text-xs font-semibold">
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      ),
    },
    { key: "net", header: "Net", align: "right", hideOnMobile: true, render: ({ t }) => fmtEur(t.net), sortValue: ({ t }) => t.net },
    { key: "total", header: "Total incl. VAT", align: "right", render: ({ t }) => <span className="font-semibold">{fmtEur(t.total)}</span>, sortValue: ({ t }) => t.total },
    { key: "pdf", header: "", align: "right", render: ({ q }) => <button className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label={`Export ${q.number} to PDF`} onClick={(e) => { e.stopPropagation(); setPrinting(q); }}><FileDown size={16} /></button> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Sales" title="B2B Quotes" subtitle="Corporate gifts and wholesale offers, with optional custom logo (private label)."
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New quote</button>} />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["Open pipeline", fmtEur0(sum(["Draft", "Sent"]))], ["Sent, awaiting reply", String(db.quotes.filter((q) => q.status === "Sent").length)], ["Won (all time)", fmtEur0(sum(["Accepted"]))], ["Win rate", winRate == null ? "—" : `${Math.round(winRate * 100)}%`]].map(([l, v]) => (
          <div key={l} className="glass-soft px-4 py-3"><div className="label">{l}</div><div className="num mt-1 font-display text-lg font-semibold">{v}</div></div>
        ))}
      </div>
      <GlassCard hover={false}>
        <div className="mb-4"><Segmented value={filter} onChange={setFilter} options={[{ value: "All", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: s }))]} /></div>
        <DataTable rows={rows} columns={cols} rowKey={({ q }) => q.id} onRowClick={({ q }) => setEditing(q)} initialSort={{ key: "num", dir: "desc" }}
          empty={<EmptyState icon={FileSpreadsheet} title="No quotes here" text="Create a quote for a corporate client or retail partner." action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New quote</button>} />} />
      </GlassCard>
      <QuoteModal open={creating || !!editing} quote={editing} onClose={() => { setCreating(false); setEditing(null); }} onPrint={setPrinting} />
      {printing && !isArtifact() && createPortal(<PrintableQuote q={printing} db={db} />, document.body)}
    </div>
  );
}

function nextNumber(quotes: Quote[]) {
  const y = todayISO().slice(0, 4);
  const max = quotes.filter((q) => q.number.includes(y)).reduce((m, q) => Math.max(m, Number(q.number.split("-").pop()) || 0), 0);
  return `Q-${y}-${String(max + 1).padStart(3, "0")}`;
}

function QuoteModal({ open, quote, onClose, onPrint }: { open: boolean; quote: Quote | null; onClose: () => void; onPrint: (q: Quote) => void }) {
  const { db, upsert, remove } = useStore();
  const toast = useToast();
  const blank = (): Quote => ({ id: uid("quo"), number: nextNumber(db.quotes), date: todayISO(), validUntil: addDays(todayISO(), 30), client: "", contactEmail: "", lines: [{ productId: db.products[0]?.id ?? "", qty: 20, unitPrice: exVat(db.products[0], db.settings) }], discountPct: 0, customLogo: false, logoFeePerUnit: db.settings.defaultLogoFee, status: "Draft", notes: "" });
  const [d, setD] = useState<Quote>(blank);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? quote?.id ?? "new" : null;
  if (key !== lastKey) { setLastKey(key); if (key) { setD(quote ? structuredClone(quote) : blank()); setErr(""); } }
  const t = useMemo(() => quoteTotals(d, db.settings), [d, db.settings]);
  const setLine = (i: number, patch: Partial<Quote["lines"][number]>) => setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const validate = () => {
    if (!d.client.trim()) { setErr("Add the client name."); return false; }
    if (d.lines.some((l) => !(l.qty > 0) || !(l.unitPrice >= 0))) { setErr("Check quantities and prices."); return false; }
    if (d.discountPct < 0 || d.discountPct > 100) { setErr("Discount must be 0–100%."); return false; }
    return true;
  };
  const save = () => { if (!validate()) return; upsert("quotes", { ...d, client: d.client.trim() }); toast(quote ? `${d.number} saved` : `${d.number} created`); onClose(); };

  return (
    <>
      <Modal open={open} onClose={onClose} size="xl" title={quote ? `Quote ${d.number}` : "New B2B quote"} subtitle="Unit prices excl. VAT; VAT is added on the total."
        footer={<>
          {quote && <button className="btn-danger mr-auto" onClick={() => setConfirm(true)}><Trash2 size={15} /></button>}
          {err && <span className="text-sm text-glow-rose">{err}</span>}
          <button className="btn-ghost" onClick={() => { if (validate()) { upsert("quotes", d); onPrint(d); } }}><FileDown size={15} /> Export PDF</button>
          <button className="btn-primary" onClick={save}>Save quote</button>
        </>}>
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client">
                <input className="input" list="quote-clients" value={d.client} onChange={(e) => { const p = db.partners.find((x) => x.name === e.target.value); setD({ ...d, client: e.target.value, partnerId: p?.id, contactEmail: d.contactEmail || p?.email || "" }); }} />
                <datalist id="quote-clients">{db.partners.map((p) => <option key={p.id} value={p.name} />)}</datalist>
              </Field>
              <Field label="Contact email"><input className="input" type="email" value={d.contactEmail} onChange={(e) => setD({ ...d, contactEmail: e.target.value })} /></Field>
              <Field label="Date"><input type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
              <Field label="Valid until"><input type="date" className="input" value={d.validUntil} onChange={(e) => setD({ ...d, validUntil: e.target.value })} /></Field>
            </div>
            <Field label="Status"><Segmented value={d.status} onChange={(s) => setD({ ...d, status: s })} options={STATUSES.map((s) => ({ value: s, label: s }))} /></Field>
            <div>
              <div className="label mb-2">Products</div>
              <div className="space-y-2">
                {d.lines.map((l, i) => (
                  <div key={i} className="glass-soft grid grid-cols-[1fr_1fr_32px] items-center gap-2 p-2 sm:grid-cols-[1fr_72px_96px_88px_32px] [&>select:first-child]:col-span-3 sm:[&>select:first-child]:col-span-1">
                    <select className="input" value={l.productId} aria-label="Product" onChange={(e) => setLine(i, { productId: e.target.value, unitPrice: exVat(db.products.find((p) => p.id === e.target.value), db.settings) })}>{db.products.map((p) => <option key={p.id} value={p.id}>{productName(p)}</option>)}</select>
                    <input className="input text-right" aria-label="Quantity" inputMode="numeric" value={l.qty} onChange={(e) => setLine(i, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                    <input className="input text-right" aria-label="Unit price excl. VAT" inputMode="decimal" value={String(l.unitPrice).replace(".", ",")} onChange={(e) => setLine(i, { unitPrice: parseAmount(e.target.value) ?? 0 })} />
                    <span className="num text-right text-sm text-white/70 max-sm:hidden">{fmtEur(l.qty * l.unitPrice)}</span>
                    <button className="grid place-items-center text-white/50 hover:text-glow-rose disabled:opacity-30" disabled={d.lines.length === 1} aria-label="Remove line" onClick={() => setD({ ...d, lines: d.lines.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
              <button className="btn-ghost mt-2 text-xs" onClick={() => setD({ ...d, lines: [...d.lines, { productId: db.products[0]?.id ?? "", qty: 10, unitPrice: exVat(db.products[0], db.settings) }] })}><Plus size={14} /> Add product</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Discount %"><input className="input" inputMode="decimal" value={String(d.discountPct).replace(".", ",")} onChange={(e) => setD({ ...d, discountPct: parseAmount(e.target.value) ?? 0 })} /></Field>
              <label className="glass-soft flex items-center gap-2 px-3 py-2.5 text-sm sm:col-span-1"><input type="checkbox" checked={d.customLogo} onChange={(e) => setD({ ...d, customLogo: e.target.checked })} className="h-4 w-4 accent-[#A78BFA]" /> Custom logo</label>
              <Field label="Logo fee / unit (€)"><input className="input" inputMode="decimal" disabled={!d.customLogo} value={String(d.logoFeePerUnit).replace(".", ",")} onChange={(e) => setD({ ...d, logoFeePerUnit: parseAmount(e.target.value) ?? 0 })} /></Field>
            </div>
            <Field label="Notes on the quote"><textarea className="input min-h-[70px]" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Delivery time, payment terms…" /></Field>
          </div>
          <div className="glass-soft h-fit space-y-2 p-4 text-sm">
            <div className="label mb-2">Totals</div>
            <Line label={`Subtotal (${t.units} units)`} v={t.subtotal} />
            {d.discountPct > 0 && <Line label={`Discount ${d.discountPct}%`} v={-t.discount} />}
            {d.customLogo && <Line label="Custom logo" v={t.logo} />}
            <Line label="Net" v={t.net} strong />
            <Line label={`VAT ${Math.round(db.settings.vatRate * 100)}%`} v={t.vat} />
            <div className="flex items-center justify-between border-t border-white/15 pt-3"><span className="heading text-xs">Total</span><span className="num font-display text-xl font-semibold text-glow-cyan">{fmtEur(t.total)}</span></div>
          </div>
        </div>
      </Modal>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title={`Delete ${d.number}?`} text="The quote will be removed." onConfirm={() => { remove("quotes", d.id); toast(`${d.number} deleted`, "info"); onClose(); }} />
    </>
  );
}

const Line = ({ label, v, strong }: { label: string; v: number; strong?: boolean }) => (
  <div className={`flex justify-between ${strong ? "border-t border-white/15 pt-2 font-semibold" : "text-white/75"}`}><span>{label}</span><span className="num">{fmtEur(v)}</span></div>
);

/** Rendered only while printing; the print stylesheet hides everything else. */
function PrintableQuote({ q, db, standalone = false }: { q: Quote; db: Database; standalone?: boolean }) {
  const s = db.settings;
  const t = quoteTotals(q, s);
  return (
    <div id="print-root" style={{ display: standalone ? "block" : "none", fontFamily: "Inter, Arial, sans-serif", color: "#111", background: "#fff", padding: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #5B2A9E", paddingBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "Unbounded, Arial", fontWeight: 700, fontSize: 22, letterSpacing: 3, color: "#2A1260" }}>INNOMETRICS</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{s.companyName}{s.vatNumber ? ` · VAT ${s.vatNumber}` : ""}<br />{s.address}{s.email ? ` · ${s.email}` : ""}{s.phone ? ` · ${s.phone}` : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Quotation</div>
          <div style={{ fontSize: 12, color: "#444" }}>{q.number}<br />Date: {fmtDate(q.date)}<br />Valid until: {fmtDate(q.validUntil)}</div>
        </div>
      </div>
      <div style={{ margin: "18px 0", fontSize: 13 }}><strong>Prepared for:</strong> {q.client}{q.contactEmail ? ` · ${q.contactEmail}` : ""}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#f1edf9" }}>{["Product", "SKU", "Qty", "Unit price", "Amount"].map((h, i) => <th key={h} style={{ textAlign: i > 1 ? "right" : "left", padding: "8px 10px", borderBottom: "1px solid #ddd" }}>{h}</th>)}</tr></thead>
        <tbody>
          {q.lines.map((l, i) => { const p = db.products.find((x) => x.id === l.productId); return (
            <tr key={i}><td style={{ padding: "8px 10px", borderBottom: "1px solid #eee" }}>{productName(p)}</td><td style={{ padding: "8px 10px", borderBottom: "1px solid #eee", color: "#666" }}>{p?.sku}</td><td style={{ padding: "8px 10px", borderBottom: "1px solid #eee", textAlign: "right" }}>{l.qty}</td><td style={{ padding: "8px 10px", borderBottom: "1px solid #eee", textAlign: "right" }}>{fmtEur(l.unitPrice)}</td><td style={{ padding: "8px 10px", borderBottom: "1px solid #eee", textAlign: "right" }}>{fmtEur(l.qty * l.unitPrice)}</td></tr>
          ); })}
        </tbody>
      </table>
      <table style={{ marginLeft: "auto", marginTop: 14, fontSize: 12, minWidth: 260 }}>
        <tbody>
          <tr><td style={{ padding: "4px 10px" }}>Subtotal</td><td style={{ textAlign: "right", padding: "4px 10px" }}>{fmtEur(t.subtotal)}</td></tr>
          {q.discountPct > 0 && <tr><td style={{ padding: "4px 10px" }}>Discount {q.discountPct}%</td><td style={{ textAlign: "right", padding: "4px 10px" }}>−{fmtEur(t.discount)}</td></tr>}
          {q.customLogo && <tr><td style={{ padding: "4px 10px" }}>Custom logo ({t.units} × {fmtEur(q.logoFeePerUnit)})</td><td style={{ textAlign: "right", padding: "4px 10px" }}>{fmtEur(t.logo)}</td></tr>}
          <tr><td style={{ padding: "4px 10px" }}>Net amount</td><td style={{ textAlign: "right", padding: "4px 10px" }}>{fmtEur(t.net)}</td></tr>
          <tr><td style={{ padding: "4px 10px" }}>VAT {Math.round(s.vatRate * 100)}%</td><td style={{ textAlign: "right", padding: "4px 10px" }}>{fmtEur(t.vat)}</td></tr>
          <tr style={{ fontWeight: 700, fontSize: 14 }}><td style={{ padding: "8px 10px", borderTop: "2px solid #5B2A9E" }}>Total</td><td style={{ textAlign: "right", padding: "8px 10px", borderTop: "2px solid #5B2A9E" }}>{fmtEur(t.total)}</td></tr>
        </tbody>
      </table>
      {q.customLogo && <p style={{ fontSize: 11, color: "#444", marginTop: 18 }}>Custom logo: your logo printed on the box and set as the Bluetooth device name.</p>}
      {q.notes && <p style={{ fontSize: 11, color: "#444", marginTop: 8, whiteSpace: "pre-wrap" }}>{q.notes}</p>}
      <p style={{ fontSize: 10, color: "#888", marginTop: 40 }}>Prices in euro. This quotation is valid until {fmtDate(q.validUntil)}.</p>
    </div>
  );
}
