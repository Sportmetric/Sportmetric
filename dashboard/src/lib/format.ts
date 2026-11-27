export const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
export const eur0 = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const num0 = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 0 });
export const num1 = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 1 });

export const fmtEur = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : eur.format(v));
export const fmtEur0 = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : eur0.format(v));
export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`;
export const signedEur = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${eur.format(Math.abs(v))}`;

const pad = (n: number) => String(n).padStart(2, "0");
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86_400_000);
export const monthKey = (iso: string) => iso.slice(0, 7);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (key: string, withYear = false) => {
  const [y, m] = key.split("-");
  return withYear ? `${MONTHS[+m - 1]} ${y.slice(2)}` : MONTHS[+m - 1];
};
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
};
export const fmtDateShort = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${+d} ${MONTHS[+m - 1]}`;
};
export const relativeDays = (iso: string, today = todayISO()) => {
  const d = daysBetween(today, iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
};
/** Last `n` month keys ending with the month of `today`, oldest first. */
export const lastMonths = (n: number, today = todayISO()) => {
  const out: string[] = [];
  const [y, m] = today.split("-").map(Number);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return out;
};

export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Parses "1.234,56", "1234.56" or "€ 99" into a number. */
export function parseAmount(input: string): number | null {
  let s = String(input ?? "").trim().replace(/\s|€/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

export { saveFile as downloadFile } from "./platform";

export function toCsv(rows: (string | number | null | undefined)[][]) {
  const q = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  // ";" separator + BOM so Greek Excel opens it correctly
  return "﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n");
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Deep copy for plain JSON data (works on every browser, unlike structuredClone on older iPhones). */
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
