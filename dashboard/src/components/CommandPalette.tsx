import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Boxes, CornerDownLeft, FileSpreadsheet, Handshake, Search, ShoppingBag, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../data/store";
import { productName } from "../lib/calc";
import { fmtDateShort } from "../lib/format";
import { openNew, ROUTES, type RouteId } from "../lib/router";

interface Hit { id: string; group: string; label: string; sub?: string; href: string; icon: typeof Search }

const PAGE_LABELS: Record<RouteId, string> = {
  overview: "Overview", orders: "Orders", inventory: "Inventory", partners: "Partners (CRM)", quotes: "B2B Quotes", finance: "Finance",
  marketing: "Marketing", tasks: "Tasks", report: "Weekly Report", settings: "Settings",
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = useStore();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(""); setActive(0); input.current?.focus(); }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    const match = (...xs: (string | undefined)[]) => !term || xs.some((x) => x?.toLowerCase().includes(term));
    const out: Hit[] = [];
    out.push(...[{ id: "a-order", label: "Record an order", href: "#orders?new" }, { id: "a-quote", label: "Create a B2B quote", href: "#quotes?new" }, { id: "a-task", label: "Add a task", href: "#tasks?new" }]
      .filter((a) => match(a.label)).map((a) => ({ ...a, group: "Actions", icon: Zap })));
    out.push(...ROUTES.filter((r) => match(PAGE_LABELS[r], r)).map((r) => ({ id: "p-" + r, group: "Pages", label: PAGE_LABELS[r], href: `#${r}`, icon: ArrowRight })));
    if (term) {
      out.push(...db.orders.filter((o) => match(o.number, o.customer, o.channel)).slice(0, 6).map((o) => ({ id: o.id, group: "Orders", label: `${o.number} · ${o.customer}`, sub: `${o.channel} · ${fmtDateShort(o.date)} · ${o.status}`, href: "#orders", icon: ShoppingBag })));
      out.push(...db.partners.filter((p) => match(p.name, p.city, p.contactName)).slice(0, 6).map((p) => ({ id: p.id, group: "Partners", label: p.name, sub: `${p.stage} · ${p.city}`, href: "#partners", icon: Handshake })));
      out.push(...db.products.filter((p) => match(p.model, p.variant, p.sku, p.ean)).slice(0, 6).map((p) => ({ id: p.id, group: "Products", label: productName(p), sub: p.sku, href: "#inventory", icon: Boxes })));
      out.push(...db.quotes.filter((x) => match(x.number, x.client)).slice(0, 4).map((x) => ({ id: x.id, group: "Quotes", label: `${x.number} · ${x.client}`, sub: x.status, href: "#quotes", icon: FileSpreadsheet })));
    }
    return out;
  }, [q, db]);

  useEffect(() => setActive(0), [q]);
  const go = (h?: Hit) => {
    if (!h) return;
    if (h.href.endsWith("?new")) openNew(h.href.slice(1, -4) as RouteId);
    else window.location.hash = h.href;
    onClose();
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[75] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label="Command palette" initial={{ y: -12, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -8, scale: 0.98, opacity: 0 }}
            className="glass-card relative w-full max-w-xl overflow-hidden border-white/25 bg-[#1a1450]/90">
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
              <Search size={18} className="text-glow-cyan" />
              <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or jump to…" className="flex-1 bg-transparent text-base text-white placeholder-white/40 outline-none"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  else if (e.key === "Enter") go(hits[active]);
                  else if (e.key === "Escape") onClose();
                }} />
              <kbd className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">esc</kbd>
            </div>
            <ul className="max-h-[55vh] overflow-y-auto p-2">
              {hits.length === 0 && <li className="px-3 py-8 text-center text-sm text-white/50">No results for “{q}”.</li>}
              {hits.map((h, i) => {
                const header = h.group !== lastGroup ? <li className="label px-3 pb-1 pt-3 text-white/40">{h.group}</li> : null;
                lastGroup = h.group;
                const Icon = h.icon;
                return (
                  <li key={h.group + h.id} className="contents">
                    {header}
                    <button onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === active ? "bg-white/[0.12]" : ""}`}>
                      <Icon size={16} className="text-white/60" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{h.label}</span>{h.sub && <span className="block truncate text-xs text-white/45">{h.sub}</span>}</span>
                      {i === active && <CornerDownLeft size={14} className="text-white/40" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
