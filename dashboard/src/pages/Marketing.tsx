import { CalendarDays, ChevronLeft, ChevronRight, Megaphone, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, statusTone, type Tone } from "../components/Badge";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { Field, Segmented } from "../components/Field";
import { CardHeader, GlassCard } from "../components/GlassCard";
import { ConfirmModal, Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useStore } from "../data/store";
import type { Campaign, CampaignStatus, ContentItem, Platform } from "../data/types";
import { productName } from "../lib/calc";
import { fmtDate, fmtEur, fmtEur0, num0, parseAmount, todayISO, toISO, uid } from "../lib/format";

const PLATFORMS: Platform[] = ["Instagram", "TikTok", "YouTube", "Facebook", "Event", "Other"];
const C_STATUSES: CampaignStatus[] = ["Idea", "Contacted", "Agreed", "Live", "Done"];
const PLATFORM_TONE: Record<Platform, Tone> = { Instagram: "pink", TikTok: "cyan", YouTube: "rose", Facebook: "violet", Event: "amber", Other: "neutral" };

export function Marketing() {
  const { db } = useStore();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [contentFor, setContentFor] = useState<{ item: ContentItem | null; date: string } | null>(null);

  const spent = db.campaigns.filter((c) => c.status === "Live" || c.status === "Done").reduce((s, c) => s + c.cost, 0);
  const sales = db.campaigns.reduce((s, c) => s + (c.sales ?? 0), 0);
  const reach = db.campaigns.reduce((s, c) => s + (c.reach ?? 0), 0);

  const cols: Column<Campaign>[] = [
    { key: "name", header: "Collab", render: (c) => <span><span className="block font-semibold">{c.name}</span><span className="text-xs text-white/45">{c.handle}</span></span>, sortValue: (c) => c.name },
    { key: "pf", header: "Platform", render: (c) => <Badge tone={PLATFORM_TONE[c.platform]}>{c.platform}</Badge>, sortValue: (c) => c.platform },
    { key: "date", header: "Date", hideOnMobile: true, render: (c) => fmtDate(c.date), sortValue: (c) => c.date },
    { key: "st", header: "Status", render: (c) => <Badge tone={statusTone[c.status]} dot>{c.status}</Badge>, sortValue: (c) => C_STATUSES.indexOf(c.status) },
    { key: "cost", header: "Cost", align: "right", render: (c) => fmtEur0(c.cost), sortValue: (c) => c.cost },
    { key: "reach", header: "Reach", align: "right", hideOnMobile: true, render: (c) => (c.reach == null ? "—" : num0.format(c.reach)), sortValue: (c) => c.reach ?? -1 },
    { key: "clicks", header: "Clicks", align: "right", hideOnMobile: true, render: (c) => (c.clicks == null ? "—" : num0.format(c.clicks)), sortValue: (c) => c.clicks ?? -1 },
    { key: "sales", header: "Sales", align: "right", render: (c) => (c.sales == null ? "—" : c.sales), sortValue: (c) => c.sales ?? -1 },
    { key: "cps", header: "Cost / sale", align: "right", render: (c) => (c.sales ? <span className="text-glow-mint">{fmtEur(c.cost / c.sales)}</span> : "—"), sortValue: (c) => (c.sales ? c.cost / c.sales : 1e9) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Growth" title="Marketing" subtitle="Influencers, collaborations and what you will publish next."
        actions={<><button className="btn-ghost" onClick={() => setContentFor({ item: null, date: todayISO() })}><CalendarDays size={16} /> Plan content</button><button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New collab</button></>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["Spent (live & done)", fmtEur0(spent)], ["Total reach", num0.format(reach)], ["Attributed sales", num0.format(sales)], ["Cost per sale", sales ? fmtEur(spent / sales) : "—"]].map(([l, v]) => (
          <div key={l} className="glass-soft px-4 py-3"><div className="label">{l}</div><div className="num mt-1 font-display text-lg font-semibold">{v}</div></div>
        ))}
      </div>
      <GlassCard hover={false}>
        <CardHeader title="Influencer & collab tracker" subtitle="Click a row to edit results" />
        <DataTable rows={db.campaigns} columns={cols} rowKey={(c) => c.id} onRowClick={setEditing} initialSort={{ key: "date", dir: "desc" }}
          empty={<EmptyState icon={Megaphone} title="No collaborations yet" action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New collab</button>} />} />
      </GlassCard>
      <ContentCalendar onOpen={(item, date) => setContentFor({ item, date })} />
      <CampaignModal open={creating || !!editing} campaign={editing} onClose={() => { setCreating(false); setEditing(null); }} />
      <ContentModal target={contentFor} onClose={() => setContentFor(null)} />
    </div>
  );
}

function ContentCalendar({ onOpen }: { onOpen: (item: ContentItem | null, date: string) => void }) {
  const { db } = useStore();
  const [offset, setOffset] = useState(0);
  const today = todayISO();
  const { days, title } = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // Monday start
    const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return { iso: toISO(d), inMonth: d.getMonth() === first.getMonth(), day: d.getDate() }; });
    return { days, title: first.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  }, [offset]);
  const byDay = useMemo(() => { const m: Record<string, ContentItem[]> = {}; db.content.forEach((c) => (m[c.date] ||= []).push(c)); return m; }, [db.content]);
  return (
    <GlassCard hover={false}>
      <CardHeader title="Content calendar" subtitle="Click a day to plan a post"
        action={<div className="flex items-center gap-2"><button className="btn-ghost px-2 py-1.5" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month"><ChevronLeft size={16} /></button><span className="w-36 text-center text-sm font-semibold">{title}</span><button className="btn-ghost px-2 py-1.5" onClick={() => setOffset((o) => o + 1)} aria-label="Next month"><ChevronRight size={16} /></button></div>} />
      <div className="-mx-1 overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 gap-1.5 px-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="label pb-1 text-center">{d}</div>)}
          {days.map((d) => (
            <div key={d.iso} role="button" tabIndex={0} onClick={() => onOpen(null, d.iso)} onKeyDown={(e) => e.key === "Enter" && onOpen(null, d.iso)}
              className={`min-h-[92px] cursor-pointer rounded-xl border p-1.5 text-left transition hover:bg-white/[0.08] ${d.inMonth ? "border-white/10 bg-white/[0.04]" : "border-transparent opacity-40"} ${d.iso === today ? "ring-2 ring-glow-cyan/60" : ""}`}>
              <div className={`mb-1 text-xs ${d.iso === today ? "font-bold text-glow-cyan" : "text-white/55"}`}>{d.day}</div>
              <div className="space-y-1">
                {(byDay[d.iso] ?? []).map((c) => (
                  <button key={c.id} onClick={(e) => { e.stopPropagation(); onOpen(c, c.date); }}
                    className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium ${c.status === "Published" ? "bg-glow-mint/15 text-glow-mint" : c.status === "In progress" ? "bg-glow-amber/15 text-glow-amber" : "bg-glow-violet/20 text-white"}`} title={`${c.platform}: ${c.title}`}>
                    {c.platform.slice(0, 2).toUpperCase()} · {c.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

function CampaignModal({ open, campaign, onClose }: { open: boolean; campaign: Campaign | null; onClose: () => void }) {
  const { upsert, remove } = useStore();
  const toast = useToast();
  const blank = (): Campaign => ({ id: uid("cmp"), name: "", handle: "", platform: "Instagram", cost: 0, status: "Idea", date: todayISO(), reach: null, clicks: null, sales: null, notes: "" });
  const [d, setD] = useState<Campaign>(blank);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? campaign?.id ?? "new" : null;
  if (key !== lastKey) { setLastKey(key); if (key) { setD(campaign ? { ...campaign } : blank()); setErr(""); } }
  const n = (v: string) => { const x = parseAmount(v); return x == null || Number.isNaN(x) ? null : x; };
  const save = () => { if (!d.name.trim()) return setErr("Add a name."); upsert("campaigns", { ...d, name: d.name.trim() }); toast(campaign ? "Collab updated" : "Collab added"); onClose(); };
  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" title={campaign ? d.name : "New collab"}
        footer={<>{campaign && <button className="btn-danger mr-auto" onClick={() => setConfirm(true)}><Trash2 size={15} /></button>}{err && <span className="text-sm text-glow-rose">{err}</span>}<button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="Handle / channel"><input className="input" value={d.handle} onChange={(e) => setD({ ...d, handle: e.target.value })} placeholder="@creator" /></Field>
          <Field label="Platform"><select className="input" value={d.platform} onChange={(e) => setD({ ...d, platform: e.target.value as Platform })}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Date"><input type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
          <Field label="Status" className="sm:col-span-2"><Segmented value={d.status} onChange={(s) => setD({ ...d, status: s })} options={C_STATUSES.map((s) => ({ value: s, label: s }))} /></Field>
          <Field label="Cost (€)"><input className="input" inputMode="decimal" value={String(d.cost).replace(".", ",")} onChange={(e) => setD({ ...d, cost: n(e.target.value) ?? 0 })} /></Field>
          <Field label="Reach"><input className="input" inputMode="numeric" value={d.reach ?? ""} onChange={(e) => setD({ ...d, reach: n(e.target.value) })} /></Field>
          <Field label="Clicks"><input className="input" inputMode="numeric" value={d.clicks ?? ""} onChange={(e) => setD({ ...d, clicks: n(e.target.value) })} /></Field>
          <Field label="Sales"><input className="input" inputMode="numeric" value={d.sales ?? ""} onChange={(e) => setD({ ...d, sales: n(e.target.value) })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><textarea className="input min-h-[70px]" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
        </div>
      </Modal>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Delete collab?" text={d.name} onConfirm={() => { remove("campaigns", d.id); toast("Collab deleted", "info"); onClose(); }} />
    </>
  );
}

function ContentModal({ target, onClose }: { target: { item: ContentItem | null; date: string } | null; onClose: () => void }) {
  const { db, upsert, remove } = useStore();
  const toast = useToast();
  const [d, setD] = useState<ContentItem>({ id: "", date: todayISO(), platform: "Instagram", title: "", status: "Planned" });
  const [last, setLast] = useState<typeof target>(null);
  if (target !== last) { setLast(target); if (target) setD(target.item ? { ...target.item } : { id: uid("cnt"), date: target.date, platform: "Instagram", title: "", status: "Planned" }); }
  const save = () => { if (!d.title.trim()) return; upsert("content", { ...d, title: d.title.trim() }); toast(target?.item ? "Post updated" : "Post planned"); onClose(); };
  return (
    <Modal open={!!target} onClose={onClose} title={target?.item ? "Edit post" : "Plan a post"}
      footer={<>{target?.item && <button className="btn-danger mr-auto" onClick={() => { remove("content", d.id); toast("Post removed", "info"); onClose(); }}><Trash2 size={15} /></button>}<button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!d.title.trim()} onClick={save}>Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><input className="input" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="W610 Photochromic reel" /></Field>
        <Field label="Date"><input type="date" className="input" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
        <Field label="Platform"><select className="input" value={d.platform} onChange={(e) => setD({ ...d, platform: e.target.value as Platform })}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Status"><select className="input" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as ContentItem["status"] })}>{["Planned", "In progress", "Published"].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Product (optional)"><select className="input" value={d.productId ?? ""} onChange={(e) => setD({ ...d, productId: e.target.value || undefined })}><option value="">None</option>{db.products.map((p) => <option key={p.id} value={p.id}>{productName(p)}</option>)}</select></Field>
      </div>
    </Modal>
  );
}
