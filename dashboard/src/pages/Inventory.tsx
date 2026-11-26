import { motion } from "framer-motion";
import { Boxes, Camera, Loader2, Glasses, PackageCheck, PackagePlus, Pencil, Plus, Ship, SlidersHorizontal, Trash2, Watch, Circle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge, statusTone } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { Field, Segmented } from "../components/Field";
import { CardHeader, GlassCard } from "../components/GlassCard";
import { ConfirmModal, Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useStore } from "../data/store";
import type { Product, ProductCategory, Shipment, ShipmentStatus, StockMovement } from "../data/types";
import { productName, skroutzUnitMargin, stockLevels, unitCosts, type StockInfo } from "../lib/calc";
import { storeProductPhoto } from "../lib/platform";
import { fmtDate, fmtEur, fmtEur0, fmtPct, num0, parseAmount, relativeDays, todayISO, uid } from "../lib/format";

const CAT_LABEL: Record<ProductCategory, string> = { glasses: "Smartglasses", watch: "Smartwatches", ring: "Smartrings" };
const CAT_ICON = { glasses: Glasses, watch: Watch, ring: Circle };
const CAT_GRAD = { glasses: "from-[#3b5bff]/60 via-[#5b2a9e]/50 to-[#5EE7FF]/30", watch: "from-[#ff8a5b]/50 via-[#b03cff]/40 to-[#FFC56B]/25", ring: "from-[#F472B6]/50 via-[#5b2a9e]/50 to-[#A78BFA]/30" };
const SHIP_STATUSES: ShipmentStatus[] = ["Ordered", "In production", "In transit", "Customs", "Arrived"];

export function Inventory() {
  const { db, upsert } = useStore();
  const toast = useToast();
  const [cat, setCat] = useState<"all" | ProductCategory>("all");
  const [onlyLow, setOnlyLow] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [moveFor, setMoveFor] = useState<{ product: Product; type: "purchase" | "adjustment" } | null>(null);
  const [shipModal, setShipModal] = useState(false);

  const stock = useMemo(() => stockLevels(db), [db]);
  const costs = useMemo(() => unitCosts(db), [db]);
  const everStocked = (id: string) => stock[id].purchased + stock[id].adjusted + stock[id].sold > 0;
  const list = db.products
    .filter((p) => (cat === "all" || p.category === cat) && (!onlyLow || (stock[p.id].state !== "ok" && everStocked(p.id))) && (!q || `${p.model} ${p.variant} ${p.sku} ${p.ean}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(everStocked(b.id)) - Number(everStocked(a.id)) || stock[b.id].qty - stock[a.id].qty);
  const totals = db.products.reduce((a, p) => {
    const s = stock[p.id], c = costs[p.id];
    if (s.qty > 0) { a.units += s.qty; a.value += s.qty * (c ?? 0); a.retail += s.qty * (p.skroutzPrice ?? 0); }
    if (s.state !== "ok" && s.purchased + s.adjusted + s.sold > 0) a.alerts++;
    a.incoming += s.incoming;
    return a;
  }, { units: 0, value: 0, retail: 0, alerts: 0, incoming: 0 });
  const maxQty = Math.max(20, ...db.products.map((p) => stock[p.id].qty));
  const openShipments = db.shipments.filter((s) => s.status !== "Arrived").sort((a, b) => a.eta.localeCompare(b.eta));

  const markArrived = (sh: Shipment) => {
    const units = sh.items.reduce((s, i) => s + i.qty, 0) || 1;
    const freightPerUnit = (sh.freightCost ?? 0) / units;
    sh.items.forEach((i) => upsert("stockMovements", { id: uid("stk"), date: todayISO(), productId: i.productId, qty: i.qty, type: "purchase", unitCost: i.unitCost != null ? Math.round((i.unitCost + freightPerUnit) * 100) / 100 : undefined, note: `Shipment ${sh.reference}` }));
    upsert("shipments", { ...sh, status: "Arrived" });
    toast(`${sh.reference} received · ${units} units added to stock`);
  };

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Inventory" subtitle="Stock is calculated from purchases and adjustments minus every order that is not cancelled or returned."
        actions={<><button className="btn-ghost" onClick={() => setShipModal(true)}><Ship size={16} /> New shipment</button><button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Add product</button></>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["Units in stock", num0.format(totals.units)], ["Stock value at cost", fmtEur0(totals.value)], ["Value at Skroutz price", fmtEur0(totals.retail)], ["Incoming units", num0.format(totals.incoming)]].map(([l, v]) => (
          <div key={l} className="glass-soft px-4 py-3"><div className="label">{l}</div><div className="num mt-1 font-display text-lg font-semibold">{v}</div></div>
        ))}
      </div>

      {openShipments.length > 0 && (
        <GlassCard hover={false} className="mb-6">
          <CardHeader title="Incoming shipments" subtitle="Mark a shipment as arrived to add its units to stock (freight is spread over the unit cost)." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {openShipments.map((sh) => (
              <div key={sh.id} className="glass-soft p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{sh.reference}</div><div className="text-xs text-white/50">{sh.supplier}</div></div>
                  <select className="rounded-lg border border-white/15 bg-white/[0.07] px-2 py-1 text-xs" value={sh.status} aria-label="Shipment status"
                    onChange={(e) => { const s = e.target.value as ShipmentStatus; if (s === "Arrived") markArrived(sh); else upsert("shipments", { ...sh, status: s }); }}>
                    {SHIP_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {sh.items.map((i, k) => <li key={k} className="flex justify-between text-white/75"><span className="truncate">{productName(db.products.find((p) => p.id === i.productId))}</span><span className="num">× {i.qty}</span></li>)}
                </ul>
                <div className="mt-3 flex items-center justify-between">
                  <Badge tone={statusTone[sh.status]} dot>ETA {fmtDate(sh.eta)} · {relativeDays(sh.eta)}</Badge>
                  <button className="text-xs font-semibold text-glow-cyan hover:underline" onClick={() => markArrived(sh)}>Mark arrived</button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={cat} onChange={setCat} options={[{ value: "all", label: "All" }, { value: "glasses", label: "Glasses" }, { value: "watch", label: "Watches" }, { value: "ring", label: "Rings" }]} />
        <button className={`chip ${onlyLow ? "border-glow-amber/50 text-glow-amber" : ""}`} onClick={() => setOnlyLow((v) => !v)} aria-pressed={onlyLow}><SlidersHorizontal size={13} /> Low stock only ({totals.alerts})</button>
        <input className="input sm:ml-auto sm:w-64" placeholder="Search SKU, model or EAN" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
      </div>

      {list.length === 0 ? (
        <GlassCard hover={false}><EmptyState icon={Boxes} title="No products match" text="Clear the filters or add a product." /></GlassCard>
      ) : (
        <motion.div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" initial="h" animate="s" transition={{ staggerChildren: 0.04 }}>
          {list.map((p) => (
            <motion.div key={p.id} variants={{ h: { opacity: 0, y: 12 }, s: { opacity: 1, y: 0 } }}>
              <ProductCard p={p} s={stock[p.id]} cost={costs[p.id]} maxQty={maxQty} onEdit={() => setEditing(p)} onReceive={() => setMoveFor({ product: p, type: "purchase" })} onAdjust={() => setMoveFor({ product: p, type: "adjustment" })} />
            </motion.div>
          ))}
        </motion.div>
      )}

      <ProductModal open={creating || !!editing} product={editing} onClose={() => { setCreating(false); setEditing(null); }} />
      <MovementModal target={moveFor} onClose={() => setMoveFor(null)} />
      <ShipmentModal open={shipModal} onClose={() => setShipModal(false)} />
    </div>
  );
}

function ProductCard({ p, s, cost, maxQty, onEdit, onReceive, onAdjust }: { p: Product; s: StockInfo; cost: number | null; maxQty: number; onEdit: () => void; onReceive: () => void; onAdjust: () => void }) {
  const { db } = useStore();
  const Icon = CAT_ICON[p.category];
  const m = skroutzUnitMargin(p, db.settings, cost);
  const pct = Math.max(2, Math.min(100, (Math.max(0, s.qty) / maxQty) * 100));
  const bar = s.state === "out" ? "from-glow-rose to-glow-pink" : s.state === "low" ? "from-glow-amber to-glow-rose" : "from-glow-cyan to-glow-mint";
  return (
    <GlassCard padded={false} className="flex h-full flex-col overflow-hidden">
      <div className={`relative h-40 bg-gradient-to-br ${CAT_GRAD[p.category]}`}>
        {p.image ? (
          <div className="absolute inset-0 bg-gradient-to-b from-white to-[#eef0f7]"><img src={p.image} alt={productName(p)} loading="lazy" className="h-full w-full object-contain p-3" /></div>
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <Icon size={46} strokeWidth={1.2} className="text-white/60 drop-shadow-[0_6px_18px_rgba(0,0,0,0.35)]" />
            <PhotoButton product={p} className="absolute bottom-3 left-1/2 -translate-x-1/2" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          {s.purchased + s.adjusted + s.sold === 0 ? <Badge tone="neutral">Not stocked yet</Badge> : <>
            {s.state === "out" && <Badge tone="rose" dot>Out of stock</Badge>}
            {s.state === "low" && <Badge tone="amber" dot>Low stock</Badge>}
          </>}
          {p.privateLabel && <Badge tone="violet">Private label</Badge>}
        </div>
        <button onClick={onEdit} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-navy-950/40 text-white/80 backdrop-blur hover:text-white" aria-label={`Edit ${productName(p)}`}><Pencil size={14} /></button>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="label text-white/45">{CAT_LABEL[p.category]}</div>
          <h3 className="mt-0.5 font-display text-[15px] font-semibold">{p.model}</h3>
          <div className="text-sm text-white/65">{p.variant || "Standard"}</div>
          <div className="mt-1 text-[11px] text-white/40">{p.sku}{p.ean ? ` · EAN ${p.ean}` : " · no EAN"}</div>
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-white/60">In stock</span>
            <span className="num font-display text-lg font-semibold">{s.qty}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10"><motion.div className={`h-full rounded-full bg-gradient-to-r ${bar}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} /></div>
          <div className="mt-1.5 text-[11px] text-white/45">{s.sold} sold · {s.purchased} bought{s.incoming ? ` · ${s.incoming} incoming ${s.nextEta ? relativeDays(s.nextEta) : ""}` : ""}</div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-white/50">Avg. cost</dt><dd className="num text-right">{fmtEur(cost)}</dd>
          <dt className="text-white/50">Skroutz</dt><dd className="num text-right">{fmtEur(p.skroutzPrice)}</dd>
          <dt className="text-white/50">Retail</dt><dd className="num text-right">{fmtEur(p.retailPrice)}</dd>
          <dt className="text-white/50">Wholesale</dt><dd className="num text-right">{fmtEur(p.wholesalePrice)}</dd>
          <dt className="text-white/50">Margin / unit (Skroutz)</dt><dd className={`num text-right font-semibold ${m && m.abs < 0 ? "text-glow-rose" : "text-glow-mint"}`}>{m ? `${fmtEur(m.abs)} · ${fmtPct(m.pct, 0)}` : "—"}</dd>
        </dl>
        <div className="mt-auto flex gap-2 pt-1">
          <button className="btn-ghost flex-1 px-2 py-2 text-xs" onClick={onReceive}><PackagePlus size={14} /> Receive</button>
          <button className="btn-ghost flex-1 px-2 py-2 text-xs" onClick={onAdjust}><PackageCheck size={14} /> Adjust</button>
        </div>
      </div>
    </GlassCard>
  );
}

/** Small "Add photo" button that uploads and saves straight onto the product. */
function PhotoButton({ product, className = "", label = "Add photo" }: { product: Product; className?: string; label?: string }) {
  const { upsert } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { const url = await storeProductPhoto(f); upsert("products", { ...product, image: url }); toast(`Photo added to ${productName(product)}`); }
    catch (e) { toast((e as Error).message || "Upload failed", "error"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return (
    <>
      <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); input.current?.click(); }}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/25 bg-navy-950/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-navy-950/65 ${className}`}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} {busy ? "Uploading…" : label}
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
    </>
  );
}

const money = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

function ProductModal({ open, product, onClose }: { open: boolean; product: Product | null; onClose: () => void }) {
  const { db, upsert, remove } = useStore();
  const toast = useToast();
  const [d, setD] = useState<Record<string, string>>({});
  const [cat, setCat] = useState<ProductCategory>("glasses");
  const [pl, setPl] = useState(false);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      const p = product;
      setD({ model: p?.model ?? "", variant: p?.variant ?? "", sku: p?.sku ?? "", ean: p?.ean ?? "", cost: money(p?.cost), skroutz: money(p?.skroutzPrice), retail: money(p?.retailPrice), wholesale: money(p?.wholesalePrice), image: p?.image ?? "" });
      setCat(p?.category ?? "glasses"); setPl(p?.privateLabel ?? false); setErr("");
    }
  }
  const f = (k: string) => ({ value: d[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  const used = product ? db.orders.some((o) => o.items.some((i) => i.productId === product.id)) || db.stockMovements.some((m) => m.productId === product.id) : false;
  const save = () => {
    if (!d.model.trim()) return setErr("Model is required.");
    if (d.ean && !/^\d{8,14}$/.test(d.ean.trim())) return setErr("EAN must be 8–14 digits.");
    const nums: Record<string, number | null> = {};
    for (const k of ["cost", "skroutz", "retail", "wholesale"]) { const v = parseAmount(d[k]); if (Number.isNaN(v) || (v != null && v < 0)) return setErr("Prices must be numbers, e.g. 39,74."); nums[k] = v; }
    const id = product?.id ?? (`${d.model}-${d.variant}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid("prd"));
    upsert("products", { id: product ? id : db.products.some((p) => p.id === id) ? uid("prd") : id, model: d.model.trim(), variant: d.variant.trim(), sku: d.sku.trim() || `IM-${d.model.trim().toUpperCase().replace(/\W+/g, "")}`, ean: d.ean.trim(), category: cat, cost: nums.cost, skroutzPrice: nums.skroutz, retailPrice: nums.retail, wholesalePrice: nums.wholesale, privateLabel: pl, image: d.image.trim() || undefined });
    toast(product ? "Product updated" : "Product added"); onClose();
  };
  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" title={product ? `Edit ${productName(product)}` : "Add product"} subtitle="Prices incl. VAT. Cost is the landed cost per unit."
        footer={<>{product && <button className="btn-danger mr-auto" disabled={used} title={used ? "Has orders or stock movements" : ""} onClick={() => setConfirm(true)}><Trash2 size={15} /> Delete</button>}{err && <span className="text-sm text-glow-rose">{err}</span>}<button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" className="sm:col-span-2"><Segmented value={cat} onChange={setCat} options={[{ value: "glasses", label: "Smartglasses" }, { value: "watch", label: "Smartwatch" }, { value: "ring", label: "Smartring" }]} /></Field>
          <Field label="Model"><input className="input" {...f("model")} /></Field>
          <Field label="Variant"><input className="input" {...f("variant")} /></Field>
          <Field label="SKU"><input className="input" {...f("sku")} /></Field>
          <Field label="EAN (GTIN)"><input className="input" inputMode="numeric" {...f("ean")} /></Field>
          <Field label="Landed cost (€)"><input className="input" inputMode="decimal" {...f("cost")} /></Field>
          <Field label="Skroutz price (€)"><input className="input" inputMode="decimal" {...f("skroutz")} /></Field>
          <Field label="Retail price (€)"><input className="input" inputMode="decimal" {...f("retail")} /></Field>
          <Field label="Wholesale price (€)"><input className="input" inputMode="decimal" {...f("wholesale")} /></Field>
          <div className="sm:col-span-2">
            <span className="label">Photo</span>
            <div className="mt-1.5 flex items-center gap-4">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/15 bg-white">
                {d.image ? <img src={d.image} alt="" className="h-full w-full object-contain p-1.5" /> : <Camera size={22} className="text-navy-950/30" />}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost text-xs" disabled={uploading} onClick={() => photoInput.current?.click()}>
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {uploading ? "Uploading…" : d.image ? "Change photo" : "Upload photo"}
                </button>
                {d.image && <button type="button" className="btn-ghost text-xs" onClick={() => setD((x) => ({ ...x, image: "" }))}>Remove</button>}
                <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setUploading(true); setErr("");
                  try { const url = await storeProductPhoto(file); setD((x) => ({ ...x, image: url })); }
                  catch (ex) { setErr((ex as Error).message || "Upload failed."); }
                  finally { setUploading(false); e.target.value = ""; }
                }} />
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={pl} onChange={(e) => setPl(e.target.checked)} className="h-4 w-4 accent-[#A78BFA]" /> Private label (our logo, box and Bluetooth name)</label>
        </div>
      </Modal>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Delete product?" text="This removes the product from the catalogue." onConfirm={() => { if (product) { remove("products", product.id); toast("Product deleted", "info"); onClose(); } }} />
    </>
  );
}

function MovementModal({ target, onClose }: { target: { product: Product; type: "purchase" | "adjustment" } | null; onClose: () => void }) {
  const { db, upsert } = useStore();
  const toast = useToast();
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [last, setLast] = useState<typeof target>(null);
  if (target !== last) { setLast(target); if (target) { setQty(""); setCost(money(target.product.cost)); setDate(todayISO()); setNote(target.type === "adjustment" ? "Opening stock" : ""); setErr(""); } }
  const save = () => {
    if (!target) return;
    const q = Number(qty);
    if (!Number.isInteger(q) || q === 0 || (target.type === "purchase" && q < 0)) return setErr(target.type === "purchase" ? "Enter a whole number above 0." : "Enter a whole number, e.g. 10 or -1.");
    const c = parseAmount(cost);
    if (target.type === "purchase" && (c == null || Number.isNaN(c) || c < 0)) return setErr("Enter the unit cost, e.g. 35,50.");
    const m: StockMovement = { id: uid("stk"), date, productId: target.product.id, qty: q, type: target.type, unitCost: target.type === "purchase" ? (c as number) : undefined, note: note.trim() };
    upsert("stockMovements", m);
    toast(`${productName(target.product)}: ${q > 0 ? "+" : ""}${q} units`);
    onClose();
  };
  return (
    <Modal open={!!target} onClose={onClose} title={target?.type === "purchase" ? "Receive stock" : "Adjust stock"} subtitle={target ? productName(target.product) : ""}
      footer={<>{err && <span className="text-sm text-glow-rose">{err}</span>}<button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={target?.type === "purchase" ? "Units received" : "Units (+ or −)"}><input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {target?.type === "purchase" && <Field label="Unit cost incl. freight (€)"><input className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>}
        <Field label={target?.type === "purchase" ? "Supplier / reference" : "Reason"} className={target?.type === "purchase" ? "" : "sm:col-span-2"}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={target?.type === "purchase" ? "Alibaba PO-…" : "Opening stock, defective, demo unit…"} /></Field>
      </div>
      {target && <p className="mt-4 text-xs text-white/50">Current stock: {stockLevels(db)[target.product.id]?.qty ?? 0} units.</p>}
    </Modal>
  );
}

function ShipmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, upsert } = useStore();
  const toast = useToast();
  const blank = (): Shipment => ({ id: uid("shp"), supplier: "", reference: `PO-${todayISO().slice(0, 4)}-`, orderedOn: todayISO(), eta: todayISO(), status: "Ordered", items: [{ productId: db.products[0]?.id ?? "", qty: 10, unitCost: db.products[0]?.cost ?? undefined }], freightCost: 0 });
  const [s, setS] = useState<Shipment>(blank);
  const [err, setErr] = useState("");
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) { setS(blank()); setErr(""); } }
  const save = () => {
    if (!s.supplier.trim() || !s.reference.trim()) return setErr("Add supplier and reference.");
    if (s.items.some((i) => !(i.qty > 0))) return setErr("Quantities must be above 0.");
    upsert("shipments", { ...s, supplier: s.supplier.trim(), reference: s.reference.trim() });
    toast(`Shipment ${s.reference} added`); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title="New incoming shipment" footer={<>{err && <span className="text-sm text-glow-rose">{err}</span>}<button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Add shipment</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier"><input className="input" value={s.supplier} onChange={(e) => setS({ ...s, supplier: e.target.value })} /></Field>
        <Field label="Reference"><input className="input" value={s.reference} onChange={(e) => setS({ ...s, reference: e.target.value })} /></Field>
        <Field label="Ordered on"><input type="date" className="input" value={s.orderedOn} onChange={(e) => setS({ ...s, orderedOn: e.target.value })} /></Field>
        <Field label="ETA"><input type="date" className="input" value={s.eta} onChange={(e) => setS({ ...s, eta: e.target.value })} /></Field>
        <Field label="Freight & customs (€)"><input className="input" inputMode="decimal" value={money(s.freightCost)} onChange={(e) => setS({ ...s, freightCost: parseAmount(e.target.value) ?? 0 })} /></Field>
        <Field label="Status"><select className="input" value={s.status} onChange={(e) => setS({ ...s, status: e.target.value as ShipmentStatus })}>{SHIP_STATUSES.filter((x) => x !== "Arrived").map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <div className="label mb-2 mt-5">Items</div>
      <div className="space-y-2">
        {s.items.map((it, i) => (
          <div key={i} className="glass-soft grid grid-cols-[1fr_72px_96px_32px] gap-2 p-2">
            <select className="input" value={it.productId} aria-label="Product" onChange={(e) => setS({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)) })}>{db.products.map((p) => <option key={p.id} value={p.id}>{productName(p)}</option>)}</select>
            <input className="input text-right" aria-label="Quantity" inputMode="numeric" value={it.qty} onChange={(e) => setS({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, qty: Math.floor(Number(e.target.value) || 0) } : x)) })} />
            <input className="input text-right" aria-label="Unit cost" inputMode="decimal" placeholder="€/unit" value={money(it.unitCost)} onChange={(e) => setS({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, unitCost: parseAmount(e.target.value) ?? undefined } : x)) })} />
            <button className="grid place-items-center rounded-lg text-white/50 hover:text-glow-rose disabled:opacity-30" disabled={s.items.length === 1} aria-label="Remove item" onClick={() => setS({ ...s, items: s.items.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <button className="btn-ghost mt-2 text-xs" onClick={() => setS({ ...s, items: [...s.items, { productId: db.products[0]?.id ?? "", qty: 10 }] })}><Plus size={14} /> Add item</button>
    </Modal>
  );
}
