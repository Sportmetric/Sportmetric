import { motion } from "framer-motion";
import { CalendarClock, Copy, Mail, MessageSquare, Phone, Plus, ShoppingBag, StickyNote, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../components/Badge";
import { Field, Segmented } from "../components/Field";
import { ConfirmModal, Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useStore } from "../data/store";
import type { Activity, Database, Partner, PartnerStage, PartnerType } from "../data/types";
import { isCountedOrder, orderGross, productName } from "../lib/calc";
import { openNew } from "../lib/router";
import { addDays, fmtDate, fmtDateShort, fmtEur0, relativeDays, todayISO, uid } from "../lib/format";

const STAGES: PartnerStage[] = ["Lead", "Contacted", "Meeting", "Negotiation", "Active"];
const TYPES: PartnerType[] = ["Retail chain", "Store", "Corporate", "Marketplace", "Distributor"];
const ACT_ICON = { call: Phone, email: Mail, meeting: Users, note: StickyNote, order: ShoppingBag };
const STAGE_GLOW: Record<PartnerStage, string> = { Lead: "bg-white/40", Contacted: "bg-glow-cyan", Meeting: "bg-glow-violet", Negotiation: "bg-glow-amber", Active: "bg-glow-mint" };

export function Partners() {
  const { db, upsert } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState<Partner | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<PartnerStage | null>(null);
  const [q, setQ] = useState("");
  const [mobileStage, setMobileStage] = useState<PartnerStage>("Lead");
  const today = todayISO();

  const revenue = useMemo(() => {
    const m: Record<string, number> = {};
    db.orders.filter(isCountedOrder).forEach((o) => { if (o.partnerId) m[o.partnerId] = (m[o.partnerId] || 0) + orderGross(o); });
    return m;
  }, [db.orders]);
  const list = db.partners.filter((p) => !q || `${p.name} ${p.city} ${p.contactName}`.toLowerCase().includes(q.toLowerCase()));
  const due = db.partners.filter((p) => p.nextFollowUp && p.nextFollowUp <= today).length;

  const moveTo = (id: string, stage: PartnerStage) => {
    const p = db.partners.find((x) => x.id === id);
    if (!p || p.stage === stage) return;
    upsert("partners", { ...p, stage, activities: [...p.activities, { id: uid("act"), date: today, kind: "note", text: `Moved from ${p.stage} to ${stage}` }] });
    toast(`${p.name} moved to ${stage}`);
  };

  const cardBody = (p: Partner) => {
    const overdue = p.nextFollowUp && p.nextFollowUp < today;
    const isToday = p.nextFollowUp === today;
    const lastAct = [...p.activities].sort((a, b) => b.date.localeCompare(a.date))[0];
    return (
      <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><div className="truncate font-semibold">{p.name}</div><div className="truncate text-xs text-white/50">{p.type}{p.city ? ` · ${p.city}` : ""}</div></div>
                        {revenue[p.id] ? <span className="num text-xs font-semibold text-glow-mint">{fmtEur0(revenue[p.id])}</span> : null}
                      </div>
                      {p.nextFollowUp ? (
                        <Badge tone={overdue ? "rose" : isToday ? "amber" : "neutral"} dot><CalendarClock size={11} /> {overdue ? `Overdue · ${fmtDateShort(p.nextFollowUp)}` : isToday ? "Follow up today" : `${fmtDateShort(p.nextFollowUp)} · ${relativeDays(p.nextFollowUp)}`}</Badge>
                      ) : <span className="text-[11px] text-white/35">No follow-up set</span>}
                      {p.nextAction && <p className="line-clamp-2 text-xs text-white/75">{p.nextAction}</p>}
                      {p.notes && <p className="line-clamp-2 text-[11px] italic text-white/45">{p.notes}</p>}
                      {lastAct && <p className="truncate border-t border-white/10 pt-2 text-[11px] text-white/45">{fmtDateShort(lastAct.date)} · {lastAct.text}</p>}
      </>
    );
  };
  const nextStage = (s: PartnerStage) => STAGES[Math.min(STAGES.length - 1, STAGES.indexOf(s) + 1)];

  return (
    <div>
      <PageHeader eyebrow="Sales" title="Partners" subtitle={<>Retail partners, corporate clients and leads. <span className="hidden md:inline">Drag a card to change its stage. </span><span className={due ? "font-semibold text-glow-rose" : ""}>{due} follow-up{due === 1 ? "" : "s"} due.</span></>}
        actions={<><input className="input w-full sm:w-48" placeholder="Search partners" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search partners" /><button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Add partner</button></>} />

      {/* Phones: one stage at a time */}
      <div className="md:hidden">
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {STAGES.map((st) => {
            const n = list.filter((p) => p.stage === st).length;
            return (
              <button key={st} onClick={() => setMobileStage(st)} aria-pressed={mobileStage === st}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${mobileStage === st ? "border-white/40 bg-white/90 text-navy-950" : "border-white/15 bg-white/[0.06] text-white/75"}`}>
                <span className={`h-2 w-2 rounded-full ${STAGE_GLOW[st]}`} />{st}<span className="num opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-2.5">
          {list.filter((p) => p.stage === mobileStage).sort((a, b) => (a.nextFollowUp ?? "9999").localeCompare(b.nextFollowUp ?? "9999")).map((p) => (
            <div key={p.id} className="glass-soft p-3">
              <button className="block w-full space-y-2 text-left" onClick={() => setOpen(p)}>{cardBody(p)}</button>
              {p.stage !== "Active" && (
                <button className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.05] py-2 text-xs font-semibold text-white/80 active:bg-white/[0.12]" onClick={() => moveTo(p.id, nextStage(p.stage))}>
                  Move to {nextStage(p.stage)} →
                </button>
              )}
            </div>
          ))}
          {list.filter((p) => p.stage === mobileStage).length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-white/45">No partners in {mobileStage}.</p>}
        </div>
      </div>

      <div className="-mx-4 hidden overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 md:block">
        <div className="grid min-w-[1100px] grid-cols-5 gap-4">
          {STAGES.map((stage) => {
            const cards = list.filter((p) => p.stage === stage).sort((a, b) => (a.nextFollowUp ?? "9999").localeCompare(b.nextFollowUp ?? "9999"));
            return (
              <section key={stage} aria-label={stage}
                onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }} onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => { e.preventDefault(); if (dragId) moveTo(dragId, stage); setDragId(null); setOverStage(null); }}
                className={`glass-card flex min-h-[420px] flex-col gap-3 bg-white/[0.06] p-3 transition ${overStage === stage ? "ring-2 ring-glow-cyan/60" : ""}`}>
                <header className="flex items-center gap-2 px-1 pt-1">
                  <span className={`h-2 w-2 rounded-full ${STAGE_GLOW[stage]}`} />
                  <h2 className="heading text-[11px]">{stage}</h2>
                  <span className="chip ml-auto px-2 py-0 text-[11px]">{cards.length}</span>
                </header>
                {cards.length === 0 && <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-white/15 p-4 text-center text-xs text-white/40">Drop a partner here</div>}
                {cards.map((p) => (
                  <motion.button layout layoutId={p.id} key={p.id} draggable onDragStart={() => setDragId(p.id)} onDragEnd={() => setDragId(null)}
                    whileHover={{ y: -4 }} onClick={() => setOpen(p)}
                    className={`glass-soft cursor-grab space-y-2 p-3 text-left active:cursor-grabbing ${dragId === p.id ? "opacity-50" : ""}`}>
                    {cardBody(p)}
                  </motion.button>
                ))}
              </section>
            );
          })}
        </div>
      </div>

      {db.partners.length === 0 && <p className="mt-4 text-center text-sm text-white/55">No partners yet. Add your first retail partner or lead.</p>}
      <PartnerModal partner={open} creating={creating} onClose={() => { setOpen(null); setCreating(false); }} />
    </div>
  );
}

function PartnerModal({ partner, creating, onClose }: { partner: Partner | null; creating: boolean; onClose: () => void }) {
  const { db, upsert, remove } = useStore();
  const toast = useToast();
  const blank = (): Partner => ({ id: uid("prt"), name: "", type: "Store", stage: "Lead", city: "", contactName: "", email: "", phone: "", nextFollowUp: addDays(todayISO(), 3), nextAction: "", notes: "", activities: [] });
  const [d, setD] = useState<Partner>(blank);
  const [tab, setTab] = useState<"details" | "timeline" | "email">("details");
  const [act, setAct] = useState<{ kind: Activity["kind"]; text: string }>({ kind: "call", text: "" });
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const isOpen = !!partner || creating;
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = partner?.id ?? (creating ? "new" : null);
  if (key !== lastKey) { setLastKey(key); if (key) { setD(partner ? structuredClone(partner) : blank()); setTab("details"); setErr(""); setAct({ kind: "call", text: "" }); } }
  const live = db.partners.find((p) => p.id === d.id);

  const save = () => {
    if (!d.name.trim()) return setErr("Partner name is required.");
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return setErr("Email looks wrong.");
    upsert("partners", { ...d, name: d.name.trim(), activities: live?.activities ?? d.activities });
    toast(creating ? `${d.name} added` : `${d.name} saved`); onClose();
  };
  const logActivity = () => {
    if (!act.text.trim()) return;
    const base = live ?? d;
    const next = { ...base, activities: [...base.activities, { id: uid("act"), date: todayISO(), kind: act.kind, text: act.text.trim() }] };
    if (live) upsert("partners", next);
    setD((x) => ({ ...x, activities: next.activities }));
    setAct({ kind: act.kind, text: "" });
    toast("Activity logged");
  };
  const timeline = [...(live?.activities ?? d.activities)].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <Modal open={isOpen} onClose={onClose} size="lg" title={creating ? "Add partner" : d.name} subtitle={creating ? "" : `${d.type} · ${d.stage}`}
        footer={<>{!creating && <button className="btn-danger mr-auto" onClick={() => setConfirm(true)}><Trash2 size={15} /></button>}{err && <span className="text-sm text-glow-rose">{err}</span>}<button className="btn-ghost" onClick={onClose}>Close</button><button className="btn-primary" onClick={save}>{creating ? "Add partner" : "Save"}</button></>}>
        {!creating && <div className="mb-5"><Segmented value={tab} onChange={setTab} options={[{ value: "details", label: "Details" }, { value: "timeline", label: `Timeline (${timeline.length})` }, { value: "email", label: "Draft follow-up email" }]} /></div>}
        {tab === "details" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as PartnerType })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Stage" className="sm:col-span-2"><Segmented value={d.stage} onChange={(s) => setD({ ...d, stage: s })} options={STAGES.map((s) => ({ value: s, label: s }))} /></Field>
            <Field label="Contact person"><input className="input" value={d.contactName} onChange={(e) => setD({ ...d, contactName: e.target.value })} /></Field>
            <Field label="City"><input className="input" value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
            <Field label="Phone"><input className="input" type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
            <Field label="Next follow-up"><input className="input" type="date" value={d.nextFollowUp ?? ""} onChange={(e) => setD({ ...d, nextFollowUp: e.target.value || null })} /></Field>
            <Field label="Next action"><input className="input" value={d.nextAction} onChange={(e) => setD({ ...d, nextAction: e.target.value })} placeholder="Send samples, call buyer…" /></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea className="input min-h-[80px]" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
          </div>
        )}
        {tab === "timeline" && (
          <div>
            <div className="glass-soft mb-5 grid gap-2 p-3 sm:grid-cols-[130px_1fr_auto]">
              <select className="input" value={act.kind} aria-label="Activity type" onChange={(e) => setAct({ ...act, kind: e.target.value as Activity["kind"] })}>{(["call", "email", "meeting", "note", "order"] as const).map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}</select>
              <input className="input" placeholder="What happened?" value={act.text} onChange={(e) => setAct({ ...act, text: e.target.value })} onKeyDown={(e) => e.key === "Enter" && logActivity()} />
              <button className="btn-primary" onClick={logActivity}>Log</button>
            </div>
            {timeline.length === 0 ? <p className="py-6 text-center text-sm text-white/50">No activity yet.</p> : (
              <ol className="relative ml-3 space-y-4 border-l border-white/15 pl-6">
                {timeline.map((a) => {
                  const I = ACT_ICON[a.kind];
                  return (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[37px] grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-glow-cyan/40 to-glow-violet/40 ring-2 ring-[#1a1450]"><I size={12} /></span>
                      <div className="text-xs text-white/45">{fmtDate(a.date)} · {a.kind}</div>
                      <div className="text-sm text-white/85">{a.text}</div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
        {tab === "email" && <EmailDraft partner={d} db={db} />}
      </Modal>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title={`Delete ${d.name}?`} text="The partner and its activity timeline will be removed." onConfirm={() => { remove("partners", d.id); toast(`${d.name} deleted`, "info"); onClose(); }} />
    </>
  );
}

/** Template-based follow-up email; no data leaves the browser. */
function EmailDraft({ partner, db }: { partner: Partner; db: Database }) {
  const toast = useToast();
  const [lang, setLang] = useState<"el" | "en">("el");
  const [goal, setGoal] = useState<"followup" | "samples" | "offer" | "reorder">(partner.stage === "Active" ? "reorder" : partner.stage === "Negotiation" ? "offer" : partner.stage === "Meeting" ? "samples" : "followup");
  const last = [...partner.activities].sort((a, b) => b.date.localeCompare(a.date))[0];
  const hero = db.products.filter((p) => p.model === "W610").slice(0, 3).map(productName);
  const text = useMemo(() => buildEmail({ lang, goal, partner, last, hero, company: db.settings.brandName, sender: db.settings.userName, role: db.settings.userRole }), [lang, goal, partner, last, hero, db.settings]);
  const [body, setBody] = useState(text);
  const [lastText, setLastText] = useState(text);
  if (text !== lastText) { setLastText(text); setBody(text); }
  const copy = async () => {
    try { await navigator.clipboard.writeText(body); toast("Email copied to clipboard"); } catch { toast("Copy failed — select the text and copy it manually", "error"); }
  };
  const subject = body.split("\n")[0].replace(/^(Θέμα|Subject):\s*/, "");
  const mailto = `mailto:${encodeURIComponent(partner.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.split("\n").slice(2).join("\n"))}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Segmented value={lang} onChange={setLang} options={[{ value: "el", label: "Ελληνικά" }, { value: "en", label: "English" }]} />
        <Segmented value={goal} onChange={setGoal} options={[{ value: "followup", label: "Follow-up" }, { value: "samples", label: "Samples" }, { value: "offer", label: "Offer" }, { value: "reorder", label: "Re-order" }]} />
      </div>
      <textarea className="input min-h-[300px] font-sans leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Email draft" />
      <p className="text-xs text-white/50">Fill the parts in [brackets] before sending. The draft uses the partner's last activity and next action.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={copy}><Copy size={15} /> Copy</button>
        {partner.email && <a className="btn-ghost" href={mailto}><Mail size={15} /> Open in mail app</a>}
        <button className="btn-ghost" onClick={() => openNew("quotes")}><MessageSquare size={15} /> Create a quote</button>
      </div>
    </div>
  );
}

function buildEmail({ lang, goal, partner, last, hero, company, sender, role }: { lang: "el" | "en"; goal: string; partner: Partner; last?: Activity; hero: string[]; company: string; sender: string; role: string }) {
  const name = partner.contactName && !/buyer|manager|department|office/i.test(partner.contactName) ? partner.contactName : "";
  const products = hero.length ? hero.join(", ") : "[products]";
  if (lang === "el") {
    const hi = name ? `Αγαπητέ/ή κ. ${name},` : "Καλησπέρα σας,";
    const ref = last ? `Σε συνέχεια της τελευταίας μας επικοινωνίας (${fmtDate(last.date)}: ${last.text.toLowerCase()}), ` : "";
    const lines: Record<string, [string, string]> = {
      followup: [`Συνέχεια συνεργασίας — ${company} × ${partner.name}`, `${ref}θα ήθελα να δω αν είχατε την ευκαιρία να δείτε τον κατάλογό μας με τα smartglasses και smartwatches της ${company}.\n\nΘα χαρώ να κανονίσουμε μια σύντομη κλήση 15 λεπτών την [ημέρα/ώρα], ώστε να δούμε ποια προϊόντα ταιριάζουν καλύτερα στα καταστήματά σας.`],
      samples: [`Δείγματα ${company} για ${partner.name}`, `${ref}θα ήθελα να σας στείλω δείγματα από τα ${products}, ώστε η ομάδα σας να τα δοκιμάσει από κοντά.\n\nΜπορείτε να μου επιβεβαιώσετε τη διεύθυνση αποστολής και το όνομα του υπευθύνου; Μπορούμε να τα παραδώσουμε έως [ημερομηνία].`],
      offer: [`Προσφορά ${company} — ${partner.name}`, `${ref}σας στέλνω την αναθεωρημένη προσφορά μας για τα ${products}, με τιμή χονδρικής [τιμή] ανά τεμάχιο για ελάχιστη παραγγελία [ποσότητα] τεμαχίων.\n\nΗ προσφορά ισχύει έως [ημερομηνία]. Είμαι στη διάθεσή σας για οποιαδήποτε διευκρίνιση.`],
      reorder: [`Επαναπαραγγελία — ${partner.name}`, `${ref}θα ήθελα να δούμε μαζί τις πωλήσεις των τελευταίων εβδομάδων και να προτείνω επαναπαραγγελία πριν τις γιορτές, ώστε να μην μείνουν τα καταστήματα χωρίς απόθεμα σε ${products}.\n\nΠροτείνω [ποσότητα] τεμάχια με παράδοση έως [ημερομηνία].`],
    };
    const [subj, body] = lines[goal];
    return `Θέμα: ${subj}\n\n${hi}\n\n${body}${partner.nextAction ? `\n\nΕπόμενο βήμα: ${partner.nextAction}.` : ""}\n\nΜε εκτίμηση,\n${sender}\n${role}, ${company}\n[τηλέφωνο]`;
  }
  const hi = name ? `Dear ${name},` : "Hello,";
  const ref = last ? `Following up on our last conversation (${fmtDate(last.date)}: ${last.text.toLowerCase()}), ` : "";
  const lines: Record<string, [string, string]> = {
    followup: [`${company} × ${partner.name} — next steps`, `${ref}I wanted to check whether you had a chance to review our smartglasses and smartwatch catalogue.\n\nWould a 15-minute call on [day/time] work to see which products fit your stores best?`],
    samples: [`${company} samples for ${partner.name}`, `${ref}I'd like to send samples of ${products} so your team can try them first-hand.\n\nCould you confirm the delivery address and contact person? We can deliver by [date].`],
    offer: [`${company} offer — ${partner.name}`, `${ref}please find our revised offer for ${products}: [price] per unit wholesale for a minimum order of [quantity] units.\n\nThe offer is valid until [date]. Happy to answer any questions.`],
    reorder: [`Re-order — ${partner.name}`, `${ref}I'd like to review recent sell-through with you and suggest a re-order before the holidays so your stores stay stocked with ${products}.\n\nI propose [quantity] units delivered by [date].`],
  };
  const [subj, body] = lines[goal];
  return `Subject: ${subj}\n\n${hi}\n\n${body}${partner.nextAction ? `\n\nNext step: ${partner.nextAction}.` : ""}\n\nBest regards,\n${sender}\n${role}, ${company}\n[phone]`;
}

