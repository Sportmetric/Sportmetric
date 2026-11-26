import { Building2, Download, Percent, RotateCcw, Upload, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { Field } from "../components/Field";
import { CardHeader, GlassCard } from "../components/GlassCard";
import { ConfirmModal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { normalizeDatabase, useStore } from "../data/store";
import type { Database, Settings } from "../data/types";
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
          <CardHeader title="Data" subtitle="Everything is stored in this browser. Export a backup regularly." />
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
