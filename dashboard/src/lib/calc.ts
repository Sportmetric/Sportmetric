/**
 * Business logic. Kept free of React so it can be unit-tested or reused by scripts.
 *
 * Profit per order (all prices are recorded incl. VAT, as in the Innometrics catalogue):
 *   revenue (net)   = gross / (1 + VAT)
 *   Skroutz fee     = gross × commission / (1 + VAT)        (Skroutz orders only)
 *   product cost    = Σ qty × average purchase cost of the SKU (or the order's cost override)
 *   profit          = revenue − Skroutz fee − product cost − shipping
 * This matches the catalogue spreadsheet: (price × (1 − 10.54%)) / 1.24 − landed cost.
 */
import type { Channel, Database, Expense, ExpenseCategory, Order, Partner, Product, Quote, Settings } from "../data/types";
import { addDays, daysBetween, lastMonths, monthKey, todayISO } from "./format";

export const CHANNELS: Channel[] = ["Skroutz", "Retail", "B2B", "Direct"];
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["Merchandise", "Skroutz", "GS1", "Epsilon Net", "Marketing", "Shipping", "Packaging", "Events", "Other"];

export const productName = (p?: Product) => (p ? `${p.model}${p.variant ? ` · ${p.variant}` : ""}` : "Unknown product");

export const isCountedOrder = (o: Order) => o.status !== "Cancelled" && o.status !== "Returned";
export const orderGross = (o: Order) => o.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
export const orderUnits = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);

/** Weighted average purchase cost per product; falls back to the catalogue cost. */
export function unitCosts(db: Database): Record<string, number | null> {
  const acc: Record<string, { q: number; c: number }> = {};
  db.stockMovements.forEach((m) => {
    if (m.type === "purchase" && m.unitCost != null && m.qty > 0) {
      const a = (acc[m.productId] ||= { q: 0, c: 0 });
      a.q += m.qty;
      a.c += m.qty * m.unitCost;
    }
  });
  const out: Record<string, number | null> = {};
  db.products.forEach((p) => {
    const a = acc[p.id];
    out[p.id] = a && a.q ? a.c / a.q : p.cost;
  });
  return out;
}

export interface OrderEconomics {
  gross: number;
  net: number;
  vat: number;
  commission: number;
  productCost: number;
  shipping: number;
  profit: number;
  margin: number | null;
  missingCost: boolean;
}

export function orderEconomics(o: Order, s: Settings, costs: Record<string, number | null>): OrderEconomics {
  const gross = orderGross(o);
  const net = gross / (1 + s.vatRate);
  const commission = o.channel === "Skroutz" ? (gross * s.skroutzCommission) / (1 + s.vatRate) : 0;
  let missingCost = false;
  const productCost =
    o.costOverride != null
      ? o.costOverride
      : o.items.reduce((sum, i) => {
          const c = costs[i.productId];
          if (c == null) missingCost = true;
          return sum + i.qty * (c ?? 0);
        }, 0);
  const shipping = o.shippingCost || 0;
  const profit = net - commission - productCost - shipping;
  return { gross, net, vat: gross - net, commission, productCost, shipping, profit, margin: net ? profit / net : null, missingCost };
}

/** Per-unit margin at Skroutz price, like the catalogue spreadsheet. */
export function skroutzUnitMargin(p: Product, s: Settings, cost: number | null) {
  if (p.skroutzPrice == null || cost == null) return null;
  const netEx = (p.skroutzPrice * (1 - s.skroutzCommission)) / (1 + s.vatRate);
  return { abs: netEx - cost, pct: netEx ? (netEx - cost) / netEx : null };
}

// ---------------- stock ----------------
export interface StockInfo {
  qty: number;
  purchased: number;
  sold: number;
  adjusted: number;
  incoming: number;
  nextEta: string | null;
  state: "out" | "low" | "ok";
}

export function stockLevels(db: Database): Record<string, StockInfo> {
  const out: Record<string, StockInfo> = {};
  db.products.forEach((p) => (out[p.id] = { qty: 0, purchased: 0, sold: 0, adjusted: 0, incoming: 0, nextEta: null, state: "ok" }));
  db.stockMovements.forEach((m) => {
    const s = out[m.productId];
    if (!s) return;
    if (m.type === "purchase") s.purchased += m.qty;
    else s.adjusted += m.qty;
  });
  db.orders.filter(isCountedOrder).forEach((o) =>
    o.items.forEach((i) => {
      const s = out[i.productId];
      if (s) s.sold += i.qty;
    }),
  );
  db.shipments
    .filter((sh) => sh.status !== "Arrived")
    .forEach((sh) =>
      sh.items.forEach((i) => {
        const s = out[i.productId];
        if (!s) return;
        s.incoming += i.qty;
        if (!s.nextEta || sh.eta < s.nextEta) s.nextEta = sh.eta;
      }),
    );
  Object.values(out).forEach((s) => {
    s.qty = s.purchased + s.adjusted - s.sold;
    s.state = s.qty <= 0 ? "out" : s.qty <= db.settings.lowStockThreshold ? "low" : "ok";
  });
  return out;
}

// ---------------- finance ----------------
export interface MonthRow {
  month: string;
  revenue: number; // gross incl. VAT
  netRevenue: number;
  orderProfit: number;
  expenses: number;
  opex: number; // expenses excluding merchandise (stock purchases become product cost)
  netProfit: number; // orderProfit − opex
  cashResult: number; // revenue − expenses
  orders: number;
  byChannel: Record<Channel, number>;
}

export function monthlyRows(db: Database, months: string[]): MonthRow[] {
  const costs = unitCosts(db);
  const rows: Record<string, MonthRow> = {};
  months.forEach(
    (m) =>
      (rows[m] = { month: m, revenue: 0, netRevenue: 0, orderProfit: 0, expenses: 0, opex: 0, netProfit: 0, cashResult: 0, orders: 0, byChannel: { Skroutz: 0, Retail: 0, B2B: 0, Direct: 0 } }),
  );
  db.orders.filter(isCountedOrder).forEach((o) => {
    const r = rows[monthKey(o.date)];
    if (!r) return;
    const e = orderEconomics(o, db.settings, costs);
    r.revenue += e.gross;
    r.netRevenue += e.net;
    r.orderProfit += e.profit;
    r.orders += 1;
    r.byChannel[o.channel] += e.gross;
  });
  db.expenses.forEach((x) => {
    const r = rows[monthKey(x.date)];
    if (!r) return;
    r.expenses += x.amount;
    if (x.category !== "Merchandise") r.opex += x.amount;
  });
  Object.values(rows).forEach((r) => {
    r.netProfit = r.orderProfit - r.opex;
    r.cashResult = r.revenue - r.expenses;
  });
  return months.map((m) => rows[m]);
}

export function expensesByCategory(expenses: Expense[]) {
  const map = new Map<ExpenseCategory, number>();
  expenses.forEach((e) => map.set(e.category, (map.get(e.category) || 0) + e.amount));
  return EXPENSE_CATEGORIES.map((c) => ({ category: c, amount: map.get(c) || 0 })).filter((x) => x.amount > 0);
}

// ---------------- quotes ----------------
export function quoteTotals(q: Quote, s: Settings) {
  const subtotal = q.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const units = q.lines.reduce((sum, l) => sum + l.qty, 0);
  const logo = q.customLogo ? units * q.logoFeePerUnit : 0;
  const discount = (subtotal * q.discountPct) / 100;
  const net = subtotal - discount + logo;
  const vat = net * s.vatRate;
  return { subtotal, units, logo, discount, net, vat, total: net + vat };
}

// ---------------- partners & attention ----------------
export const followUpDue = (p: Partner, today = todayISO()) => !!p.nextFollowUp && p.nextFollowUp <= today;

export interface AttentionItem {
  id: string;
  kind: "stock" | "followup" | "task" | "quote" | "order" | "shipment";
  title: string;
  detail: string;
  href: string;
  severity: "high" | "medium";
}

export function attentionItems(db: Database, today = todayISO()): AttentionItem[] {
  const items: AttentionItem[] = [];
  const stock = stockLevels(db);
  db.products.forEach((p) => {
    const s = stock[p.id];
    if (s.state === "ok") return;
    if (s.purchased + s.adjusted === 0 && s.sold === 0) return; // never stocked
    items.push({
      id: "stk-" + p.id,
      kind: "stock",
      title: `${productName(p)} ${s.state === "out" ? "is out of stock" : "is running low"}`,
      detail: `${s.qty} left${s.incoming ? ` · ${s.incoming} incoming` : ""}`,
      href: "#/inventory",
      severity: s.state === "out" ? "high" : "medium",
    });
  });
  db.partners.forEach((p) => {
    if (!followUpDue(p, today)) return;
    const late = daysBetween(p.nextFollowUp!, today);
    items.push({
      id: "fu-" + p.id,
      kind: "followup",
      title: `Follow up with ${p.name}`,
      detail: `${p.nextAction || "Follow-up due"}${late > 0 ? ` · ${late}d overdue` : " · today"}`,
      href: "#/partners",
      severity: late > 0 ? "high" : "medium",
    });
  });
  db.tasks.forEach((t) => {
    if (t.done || !t.due || t.due > today) return;
    items.push({ id: "tsk-" + t.id, kind: "task", title: t.title, detail: t.due < today ? `Overdue since ${t.due}` : "Due today", href: "#/tasks", severity: t.priority === "High" ? "high" : "medium" });
  });
  db.quotes.forEach((q) => {
    if (q.status === "Sent" && q.validUntil <= addDays(today, 5))
      items.push({ id: "q-" + q.id, kind: "quote", title: `Quote ${q.number} for ${q.client} expires soon`, detail: `Valid until ${q.validUntil}`, href: "#/quotes", severity: "medium" });
  });
  db.orders.forEach((o) => {
    if (o.status === "Pending" && daysBetween(o.date, today) >= 2)
      items.push({ id: "o-" + o.id, kind: "order", title: `Order ${o.number} still pending`, detail: `${o.customer} · ${o.channel}`, href: "#/orders", severity: "medium" });
  });
  db.shipments.forEach((s) => {
    if (s.status !== "Arrived" && s.eta <= addDays(today, 2))
      items.push({ id: "sh-" + s.id, kind: "shipment", title: `Shipment ${s.reference} arriving`, detail: `${s.status} · ETA ${s.eta}`, href: "#/inventory", severity: "medium" });
  });
  return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

export const nav_counts = (db: Database, today = todayISO()) => {
  const stock = stockLevels(db);
  return {
    orders: db.orders.filter((o) => o.status === "Pending" || o.status === "Paid").length,
    inventory: Object.values(stock).filter((s) => s.state !== "ok" && s.purchased + s.adjusted > 0).length,
    partners: db.partners.filter((p) => followUpDue(p, today)).length,
    quotes: db.quotes.filter((q) => q.status === "Draft" || q.status === "Sent").length,
    tasks: db.tasks.filter((t) => !t.done && t.due && t.due <= today).length,
  };
};

export const lastNMonths = lastMonths;
