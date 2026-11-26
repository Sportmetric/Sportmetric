import { Building2, Download, Palette, Percent, RotateCcw, Upload, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { Field } from "../components/Field";
import { CardHeader, GlassCard } from "../components/GlassCard";
import { ConfirmModal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { normalizeDatabase, useStore } from "../data/store";
import type { BackgroundId, Database, Settings } from "../data/types";

const BACKGROUNDS: { id: BackgroundId; label: string; preview: string }[] = [
  { id: "neon", label: "Neon (logo)", preview: "radial-gradient(circle at 20% 100%, rgba(192,38,211,.7), transparent 55%), radial-gradient(circle at 85% 100%, rgba(37,99,235,.7), transparent 55%), linear-gradient(180deg,#030208,#0d0828)" },
  { id: "aurora", label: "Aurora", preview: "radial-gradient(circle at 15% 10%, rgba(56,189,248,.6), transparent 55%), radial-gradient(circle at 90% 50%, rgba(217,70,239,.5), transparent 55%), linear-gradient(160deg,#060a26,#141a5c 45%,#3a1f86 75%,#6a2ea6)" },
  { id: "violet", label: "Royal violet", preview: "linear-gradient(135deg,#0b1033,#2a1260 55%,#5b2a9e)" },
  { id: "ocean", label: "Ocean", preview: "radial-gradient(circle at 90% 0%, rgba(34,211,238,.5), transparent 55%), linear-gradient(160deg,#03101f,#0a2647 50%,#0d5c75)" },
  { id: "midnight", label: "Midnight", preview: "radial-gradient(circle at 80% 0%, rgba(99,102,241,.45), transparent 55%), linear-gradient(160deg,#05060c,#11142a 55%,#1e2342)" },
  { id: "sunset", label: "Sunset", preview: "radial-gradient(circle at 100% 0%, rgba(251,146,60,.5), transparent 55%), linear-gradient(160deg,#150826,#3d0f4f 50%,#8c2f5a)" },
];
import { isArtifact } from "../lib/platform";
import { downloadFile, parseAmount, todayISO } from "../lib/format";

export function SettingsPage() {
  const { db, updateSettings, replaceAll, resetToSeed } = useStore();
  const toast = useToast();
  const [s, setS] = useState<Settings>(db.settings);
  const [pct, setPct] = useState({ vat: String(+(db.settings.vatRate * 100).toFixed(2)).replace(".", ","), comm: String(+(db.settings.skroutzCommission * 100).toFixed(2)).replace(".", ",") });
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<Database | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const save = () => {
    const vat = parseAmount(pct.vat), comm = parseAmount(pct.comm);
    if (vat == null || Number.isNaN(vat) || vat < 0 || vat > 50) return setErr("VAT must be between 0 and 50%.");
    if (comm == null || Number.isNaN(comm) || comm < 0 || comm > 50) return setErr("Commission must be between 0 and 50%.");
    if (!Number.isInteger(s.lowStockThreshold) || s.lowStockThreshold < 0) return setErr("Low-stock threshold must be a whole number.");
    updateSettings({ ...s, vatRate: Math.round(vat * 100) / 10000, skroutzCommission: Math.round(comm * 100) / 10000 });
    setErr(""); toast("Settings saved");
  };
  const exportBackup = () => { downloadFile(`innometrics-backup-${todayISO()}.backup.json`, JSON.stringify(db, null, 2), "application/json"); toast("Backup downloaded"); };
  const onFile = async (f?: File) => {
    if (!f) return;
    try { setPending(normalizeDatabase(JSON.parse(await f.text()))); } catch (e) { toast(`Import failed: ${(e as Error).message}`, "error"); }
    if (file.current) file.current.value = "";
  };
  const text = (k: keyof Settings) => ({ value: String(s[k] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value }) });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="System" title="Settings" subtitle="Company details and the rates used in every profit calculation." actions={<button className="btn-primary" onClick={save}>Save settings</button>} />
      {err && <p className="rounded-xl border border-glow-rose/40 bg-glow-rose/10 px-4 py-3 text-sm text-glow-rose">{err}</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        <GlassCard hover={false}>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Building2 size={16} className="text-glow-cyan" /> Company</span>} subtitle="Shown on quotes and exports" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal name" className="sm:col-span-2"><input className="input" {...text("companyName")} /></Field>
            <Field label="Brand name"><input className="input" {...text("brandName")} /></Field>
            <Field label="VAT number (ΑΦΜ)"><input className="input" {...text("vatNumber")} /></Field>
            <Field label="Address" className="sm:col-span-2"><input className="input" {...text("address")} /></Field>
            <Field label="Email"><input className="input" type="email" {...text("email")} /></Field>
            <Field label="Phone"><input className="input" type="tel" {...text("phone")} /></Field>
          </div>
        </GlassCard>
        <GlassCard hover={false}>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Percent size={16} className="text-glow-violet" /> Rates & currency</span>} subtitle="Changes apply to all orders, quotes and reports immediately" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="VAT %"><input className="input" inputMode="decimal" value={pct.vat} onChange={(e) => setPct({ ...pct, vat: e.target.value })} /></Field>
            <Field label="Skroutz commission %"><input className="input" inputMode="decimal" value={pct.comm} onChange={(e) => setPct({ ...pct, comm: e.target.value })} /></Field>
            <Field label="Currency"><select className="input" value={s.currency} onChange={() => setS({ ...s, currency: "EUR" })}><option value="EUR">Euro (€)</option></select></Field>
            <Field label="Low-stock threshold (units)"><input className="input" inputMode="numeric" value={s.lowStockThreshold} onChange={(e) => setS({ ...s, lowStockThreshold: Math.floor(Number(e.target.value) || 0) })} /></Field>
            <Field label="Default custom-logo fee (€ / unit)"><input className="input" inputMode="decimal" value={String(s.defaultLogoFee).replace(".", ",")} onChange={(e) => setS({ ...s, defaultLogoFee: parseAmount(e.target.value) ?? 0 })} /></Field>
          </div>
        </GlassCard>
        <GlassCard hover={false}>
          <CardHeader title={<span className="inline-flex items-center gap-2"><UserRound size={16} className="text-glow-pink" /> Profile</span>} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input className="input" {...text("userName")} /></Field>
            <Field label="Role"><input className="input" {...text("userRole")} /></Field>
          </div>
        </GlassCard>
        <GlassCard hover={false}>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Palette size={16} className="text-glow-cyan" /> Appearance</span>} subtitle="Background of the dashboard. Applies instantly." />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {BACKGROUNDS.map((b) => {
              const active = (db.settings.background ?? "neon") === b.id;
              return (
                <button key={b.id} type="button" onClick={() => { updateSettings({ background: b.id }); setS((x) => ({ ...x, background: b.id })); toast(`Background: ${b.label}`); }}
                  aria-pressed={active} className={`group rounded-xl p-1.5 text-left transition ${active ? "bg-white/15 ring-2 ring-glow-cyan" : "hover:bg-white/[0.08]"}`}>
                  <span className="block h-16 rounded-lg ring-1 ring-white/20" style={{ background: b.preview }} />
                  <span className="mt-1.5 block px-1 text-xs font-semibold text-white/85">{b.label}</span>
                </button>
              );
            })}
          </div>
        </GlassCard>
        <GlassCard hover={false}>
          <CardHeader title="Data" subtitle={isArtifact() ? "Saved privately in your claude.ai account. Export a backup now and then." : "Everything is stored in this browser. Export a backup regularly."} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={exportBackup}><Download size={16} /> Export backup</button>
            <button className="btn-ghost" onClick={() => file.current?.click()}><Upload size={16} /> Import backup</button>
            <button className="btn-danger" onClick={() => setConfirmReset(true)}><RotateCcw size={16} /> Reset to sample data</button>
            <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <p className="mt-4 text-xs text-white/50">
            {db.orders.length} orders · {db.expenses.length} expenses · {db.products.length} products · {db.partners.length} partners · {db.quotes.length} quotes. Backups are JSON files in the same shape as <code>src/data/types.ts</code>.
          </p>
        </GlassCard>
      </div>
      <ConfirmModal open={!!pending} onClose={() => setPending(null)} confirmLabel="Replace my data" title="Import this backup?"
        text={pending ? `This replaces all current data with ${pending.orders.length} orders, ${pending.expenses.length} expenses, ${pending.products.length} products and ${pending.partners.length} partners. Export a backup first if you want to keep the current data.` : ""}
        onConfirm={() => { if (pending) { replaceAll(pending); setS(pending.settings); setPct({ vat: String(+(pending.settings.vatRate * 100).toFixed(2)).replace(".", ","), comm: String(+(pending.settings.skroutzCommission * 100).toFixed(2)).replace(".", ",") }); toast("Backup imported"); } }} />
      <ConfirmModal open={confirmReset} onClose={() => setConfirmReset(false)} confirmLabel="Reset" title="Reset to sample data?" text="All your changes in this browser will be replaced by the sample dataset."
        onConfirm={() => { resetToSeed(); toast("Sample data restored", "info"); setTimeout(() => window.location.reload(), 300); }} />
    </div>
  );
}
