import type { ReactNode } from "react";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-xs text-white/45">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "sm" }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "xs" }) {
  return (
    <div className="inline-flex rounded-xl border border-white/15 bg-white/[0.05] p-1" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={`rounded-lg ${size === "xs" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-semibold transition ${value === o.value ? "bg-white/90 text-navy-950 shadow" : "text-white/65 hover:text-white"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
