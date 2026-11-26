import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck2, Check, Link2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, statusTone } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { Field, Segmented } from "../components/Field";
import { GlassCard } from "../components/GlassCard";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useStore } from "../data/store";
import type { Priority, Task } from "../data/types";
import { fmtDateShort, relativeDays, todayISO, uid } from "../lib/format";
import { useNewAction } from "../lib/router";

const PRIORITIES: Priority[] = ["High", "Medium", "Low"];
const PRIO_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export function Tasks() {
  const { db, upsert, remove } = useStore();
  const toast = useToast();
  const [view, setView] = useState<"open" | "today" | "done" | "all">("open");
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [quick, setQuick] = useState("");
  const today = todayISO();
  useNewAction("tasks", () => setCreating(true));

  const list = db.tasks
    .filter((t) => (view === "open" ? !t.done : view === "done" ? t.done : view === "today" ? !t.done && !!t.due && t.due <= today : true))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? "9999").localeCompare(b.due ?? "9999") || PRIO_RANK[a.priority] - PRIO_RANK[b.priority]);
  const overdue = db.tasks.filter((t) => !t.done && t.due && t.due < today).length;

  const addQuick = () => {
    if (!quick.trim()) return;
    upsert("tasks", { id: uid("tsk"), title: quick.trim(), priority: "Medium", due: today, done: false, createdAt: new Date().toISOString() });
    setQuick(""); toast("Task added");
  };
  const toggle = (t: Task) => { upsert("tasks", { ...t, done: !t.done }); if (!t.done) toast("Nice — task done"); };

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Tasks" subtitle={`${db.tasks.filter((t) => !t.done).length} open · ${overdue} overdue`} actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New task</button>} />
      <GlassCard hover={false}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented value={view} onChange={setView} options={[{ value: "open", label: "Open" }, { value: "today", label: "Due" }, { value: "done", label: "Done" }, { value: "all", label: "All" }]} />
          <div className="flex min-w-[240px] flex-1 gap-2">
            <input className="input" placeholder="Quick add a task for today and press Enter" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addQuick()} aria-label="Quick add task" />
            <button className="btn-ghost" onClick={addQuick} aria-label="Add"><Plus size={16} /></button>
          </div>
        </div>
        {list.length === 0 ? <EmptyState icon={CalendarCheck2} title={view === "done" ? "Nothing completed yet" : "You're all caught up"} text="Add a task above or link one to a partner or order." /> : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {list.map((t) => {
                const partner = db.partners.find((p) => p.id === t.partnerId);
                const order = db.orders.find((o) => o.id === t.orderId);
                const late = !t.done && t.due && t.due < today;
                return (
                  <motion.li key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-soft flex items-center gap-3 px-3 py-3">
                    <button onClick={() => toggle(t)} aria-label={t.done ? "Mark as open" : "Mark as done"} className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition ${t.done ? "border-glow-mint bg-glow-mint/80 text-navy-950" : "border-white/30 hover:border-glow-cyan"}`}>{t.done && <Check size={14} strokeWidth={3} />}</button>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                      <span className={`block truncate text-sm ${t.done ? "text-white/40 line-through" : "text-white"}`}>{t.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-white/45">
                        {t.due && <span className={late ? "font-semibold text-glow-rose" : ""}>{fmtDateShort(t.due)} · {relativeDays(t.due, today)}</span>}
                        {partner && <span className="inline-flex items-center gap-1"><Link2 size={11} />{partner.name}</span>}
                        {order && <span className="inline-flex items-center gap-1"><Link2 size={11} />{order.number}</span>}
                      </span>
                    </button>
                    <Badge tone={statusTone[t.priority]}>{t.priority}</Badge>
                    <button className="rounded-lg p-1.5 text-white/35 hover:bg-white/10 hover:text-glow-rose" aria-label="Delete task" onClick={() => { remove("tasks", t.id); toast("Task deleted", "info"); }}><Trash2 size={15} /></button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </GlassCard>
      <TaskModal open={creating || !!editing} task={editing} onClose={() => { setCreating(false); setEditing(null); }} />
    </div>
  );
}

function TaskModal({ open, task, onClose }: { open: boolean; task: Task | null; onClose: () => void }) {
  const { db, upsert } = useStore();
  const toast = useToast();
  const blank = (): Task => ({ id: uid("tsk"), title: "", priority: "Medium", due: todayISO(), done: false, createdAt: new Date().toISOString() });
  const [d, setD] = useState<Task>(blank);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? task?.id ?? "new" : null;
  if (key !== lastKey) { setLastKey(key); if (key) setD(task ? { ...task } : blank()); }
  const save = () => { if (!d.title.trim()) return; upsert("tasks", { ...d, title: d.title.trim() }); toast(task ? "Task updated" : "Task added"); onClose(); };
  const recentOrders = [...db.orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  return (
    <Modal open={open} onClose={onClose} title={task ? "Edit task" : "New task"} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!d.title.trim()} onClick={save}>Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Task" className="sm:col-span-2"><input className="input" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} /></Field>
        <Field label="Priority"><Segmented value={d.priority} onChange={(p) => setD({ ...d, priority: p })} options={PRIORITIES.map((p) => ({ value: p, label: p }))} /></Field>
        <Field label="Due date"><input type="date" className="input" value={d.due ?? ""} onChange={(e) => setD({ ...d, due: e.target.value || null })} /></Field>
        <Field label="Linked partner"><select className="input" value={d.partnerId ?? ""} onChange={(e) => setD({ ...d, partnerId: e.target.value || undefined })}><option value="">None</option>{db.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Linked order"><select className="input" value={d.orderId ?? ""} onChange={(e) => setD({ ...d, orderId: e.target.value || undefined })}><option value="">None</option>{recentOrders.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.customer}</option>)}</select></Field>
      </div>
    </Modal>
  );
}
