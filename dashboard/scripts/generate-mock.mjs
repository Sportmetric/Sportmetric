#!/usr/bin/env node
/**
 * Generates the illustrative seed data in src/data/seed/*.json.
 *
 * The SKUs, EAN codes and public prices (Skroutz / retail) match the real Innometrics
 * catalogue. Unit costs, wholesale prices, orders, expenses, quotes, campaigns and
 * tasks are MOCK values so that the public repository never contains real
 * financial data. Import your real data via Settings → Import backup.
 *
 * Run:  npm run mock
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "seed");
mkdirSync(OUT, { recursive: true });

// ---------- deterministic random ----------
let seed = 20261126;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (a, b) => Math.floor(a + rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const round2 = (v) => Math.round(v * 100) / 100;
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const ANCHOR = "2026-11-26"; // "today" for the mock dataset
let idc = 0;
const id = (p) => `${p}_${(++idc).toString(36).padStart(4, "0")}`;

// ---------- settings ----------
const settings = {
  companyName: "INNOWARE ΜΟΝΟΠΡΟΣΩΠΗ ΙΚΕ",
  brandName: "Innometrics",
  vatNumber: "",
  address: "Athens, Greece",
  email: "",
  phone: "",
  currency: "EUR",
  vatRate: 0.24,
  skroutzCommission: 0.1054,
  lowStockThreshold: 5,
  defaultLogoFee: 4,
  userName: "Labros D.",
  userRole: "Co-CEO / COO",
};

// ---------- products (real SKUs and public prices, MOCK cost & wholesale) ----------
const P = (id, sku, model, variant, category, ean, cost, skroutz, retail, wholesale) =>
  ({ id, sku, model, variant, category, ean, cost, skroutzPrice: skroutz, retailPrice: retail, wholesalePrice: wholesale, privateLabel: model === "W610" });
const products = [
  P("w610-black", "IM-W610-BLK", "W610", "Black sun lenses", "glasses", "5214004098016", 36, 149.89, 149, 99),
  P("w610-clear", "IM-W610-CLR", "W610", "Clear anti-blue", "glasses", "5214004098023", 36, 149.89, 149, 99),
  P("w610-photochromic", "IM-W610-PHC", "W610", "Photochromic", "glasses", "5214004098030", 36, 149.89, 149, 99),
  P("w610-var4", "IM-W610-V4", "W610", "Variant 4", "glasses", "", 36, 149.89, 149, 99),
  P("gs-05", "IM-GS05", "GS-05", "", "glasses", "", 22, 60, 70, 45),
  P("gs-07", "IM-GS07", "GS-07", "", "glasses", "", 22, 60, 70, 45),
  P("gs-03", "IM-GS03", "GS-03", "", "glasses", "", 21, 60, 70, 45),
  P("qy-pro-2-cycling", "IM-QYP2-CYC", "QY-pro 2", "Cycling", "glasses", "", 30, 80, 89, 58),
  P("d8-tws", "IM-D8TWS", "D8-TWS", "With earbuds", "watch", "", 24, 60, 69, 42),
  P("m109", "IM-M109", "m109", "", "watch", "", 12, 35, 39, 24),
  P("v5-black", "IM-V5-BLK", "V5", "Black", "watch", "", 17, 50, 55, 34),
  P("v5-orange", "IM-V5-ORG", "V5", "Orange", "watch", "", 17, 50, 55, 34),
  P("y13", "IM-Y13", "Y13", "", "watch", "", 14, 40, 45, 28),
];
const prod = Object.fromEntries(products.map((p) => [p.id, p]));

// ---------- months: Dec 2025 → Nov 2026 ----------
const months = [];
for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(2026, 10 - i, 1)); months.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`); }
const dayIn = (m, maxDay = 28) => {
  const last = m === ANCHOR.slice(0, 7) ? Math.min(+ANCHOR.slice(8), maxDay) : maxDay;
  return `${m}-${pad(int(1, last))}`;
};

// ---------- partners ----------
const partners = [];
const partner = (name, type, stage, city, contactName, next, nextAction, notes, acts) => {
  const p = { id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name, type, stage, city, contactName, email: "", phone: "",
    nextFollowUp: next, nextAction, notes, activities: acts.map(([date, kind, text]) => ({ id: id("act"), date, kind, text })) };
  partners.push(p); return p;
};
partner("Hondos Center", "Retail chain", "Active", "Athens", "Category buyer", addDays(ANCHOR, 2), "Propose Christmas re-order of W610 Photochromic",
  "Stocks W610 in flagship stores. Monthly re-orders.", [[addDays(ANCHOR, -40), "meeting", "Quarterly review: W610 sell-through strong in Athens stores."], [addDays(ANCHOR, -12), "order", "Re-order of 30 units W610."], [addDays(ANCHOR, -3), "email", "Sent Christmas display proposal."]]);
partner("Plaisio", "Retail chain", "Negotiation", "Athens", "Wearables buyer", addDays(ANCHOR, -1), "Send revised wholesale price list",
  "Interested in W610 + V5 bundle for 2027 catalogue.", [[addDays(ANCHOR, -30), "call", "Intro call with wearables buyer."], [addDays(ANCHOR, -16), "meeting", "Demo of W610 at HQ. Asked for 5% better margin."]]);
partner("Pool Sport", "Store", "Meeting", "Thessaloniki", "Store manager", addDays(ANCHOR, 5), "Bring QY-pro 2 Cycling samples to meeting",
  "Sports retailer, good fit for cycling glasses.", [[addDays(ANCHOR, -9), "email", "Sent catalogue PDF."], [addDays(ANCHOR, -4), "call", "Meeting booked."]]);
partner("Kallistos", "Store", "Contacted", "Patra", "", addDays(ANCHOR, 0), "Follow up on catalogue email",
  "", [[addDays(ANCHOR, -7), "email", "First outreach with catalogue."]]);
partner("Public", "Retail chain", "Lead", "Athens", "", addDays(ANCHOR, 9), "Find the wearables category manager", "", []);
partner("Kotsovolos", "Retail chain", "Lead", "Athens", "", null, "", "", []);
partner("Nova Tech SA (mock)", "Corporate", "Active", "Athens", "HR department", addDays(ANCHOR, 20), "Ask about employee gifts for Q1",
  "Corporate gifts for staff, custom logo on box.", [[addDays(ANCHOR, -33), "order", "24 units W610 with custom box."]]);
partner("Athens Sports Club (mock)", "Corporate", "Active", "Athens", "Events office", addDays(ANCHOR, 14), "Pitch GS-05 for spring events", "", [[addDays(ANCHOR, -21), "order", "12 units GS-05."]]);

// ---------- orders ----------
const orders = [];
let orderNo = 1040;
const statusFor = (date) => {
  const age = (Date.parse(ANCHOR) - Date.parse(date)) / 86400000;
  if (age < 2) return pick(["Pending", "Paid"]);
  if (age < 6) return pick(["Paid", "Shipped", "Shipped"]);
  const r = rnd();
  return r < 0.04 ? "Returned" : r < 0.07 ? "Cancelled" : "Delivered";
};
const skroutzSkus = ["w610-black", "w610-black", "w610-photochromic", "w610-clear", "gs-05", "gs-07", "gs-03", "qy-pro-2-cycling", "d8-tws", "m109", "v5-black", "v5-orange", "y13"];
const greekNames = ["G. Papadopoulos", "M. Nikolaou", "K. Georgiou", "E. Dimitriou", "A. Ioannou", "S. Vasileiou", "D. Konstantinou", "P. Christodoulou", "N. Pappas", "I. Antoniou", "T. Karagianni", "V. Makri"];
months.forEach((m, mi) => {
  const growth = 0.55 + mi * 0.06;
  const nSk = Math.round(int(9, 15) * growth + (m.endsWith("-11") ? 6 : 0));
  for (let k = 0; k < nSk; k++) {
    const pid = pick(skroutzSkus), qty = rnd() < 0.12 ? 2 : 1, date = dayIn(m);
    orders.push({ id: id("ord"), number: `IM-${++orderNo}`, date, channel: "Skroutz", customer: pick(greekNames), status: statusFor(date),
      items: [{ productId: pid, qty, unitPrice: prod[pid].skroutzPrice }], shippingCost: 3.2, costOverride: null, notes: "" });
  }
  if (mi >= 3) { // Hondos from March
    const date = dayIn(m, 20);
    const items = [{ productId: "w610-black", qty: int(6, 14), unitPrice: 99 }, { productId: "w610-photochromic", qty: int(4, 10), unitPrice: 99 }];
    if (rnd() < 0.5) items.push({ productId: "v5-black", qty: int(4, 8), unitPrice: 34 });
    orders.push({ id: id("ord"), number: `IM-${++orderNo}`, date, channel: "Retail", customer: "Hondos Center", partnerId: "hondos-center", status: statusFor(date), items, shippingCost: 18, costOverride: null, notes: "" });
  }
  if (mi % 3 === 1 || m === "2026-10") {
    const date = dayIn(m, 25);
    const corp = m === "2026-10" ? "Nova Tech SA (mock)" : pick(["Alpha Insurance (mock)", "Medilab (mock)", "Orion Logistics (mock)"]);
    orders.push({ id: id("ord"), number: `IM-${++orderNo}`, date, channel: "B2B", customer: corp, partnerId: corp === "Nova Tech SA (mock)" ? "nova-tech-sa-mock" : undefined, status: statusFor(date),
      items: [{ productId: pick(["w610-black", "w610-photochromic"]), qty: int(12, 30), unitPrice: 105 }], shippingCost: 25, costOverride: null, notes: "Custom logo on box" });
  }
  if (rnd() < 0.6) {
    const date = dayIn(m); const pid = pick(["gs-05", "y13", "m109", "w610-clear"]);
    orders.push({ id: id("ord"), number: `IM-${++orderNo}`, date, channel: "Direct", customer: pick(greekNames), status: statusFor(date),
      items: [{ productId: pid, qty: int(1, 3), unitPrice: prod[pid].retailPrice }], shippingCost: 0, costOverride: null, notes: "" });
  }
});
orders.push({ id: id("ord"), number: `IM-${++orderNo}`, date: "2026-11-07", channel: "B2B", customer: "Athens Sports Club (mock)", partnerId: "athens-sports-club-mock", status: "Delivered",
  items: [{ productId: "gs-05", qty: 12, unitPrice: 52 }], shippingCost: 0, costOverride: null, notes: "" });
orders.sort((a, b) => a.date.localeCompare(b.date));

// ---------- stock: purchases sized to cover sales, leaving realistic stock ----------
const sold = {};
orders.filter((o) => o.status !== "Cancelled" && o.status !== "Returned").forEach((o) => o.items.forEach((i) => (sold[i.productId] = (sold[i.productId] || 0) + i.qty)));
const leftover = { "w610-black": 38, "w610-clear": 4, "w610-photochromic": 22, "w610-var4": 3, "gs-05": 0, "gs-07": 9, "gs-03": 6, "qy-pro-2-cycling": 2, "d8-tws": 7, "m109": 15, "v5-black": 4, "v5-orange": 11, "y13": 13 };
const stockMovements = [];
products.forEach((p) => {
  const need = (sold[p.id] || 0) + leftover[p.id];
  const lots = need > 60 ? 3 : need > 20 ? 2 : 1;
  let rest = need;
  for (let l = 0; l < lots; l++) {
    const qty = l === lots - 1 ? rest : Math.round(need / lots);
    rest -= qty;
    stockMovements.push({ id: id("stk"), date: `${months[Math.min(11, l * 4)]}-0${int(1, 5)}`, productId: p.id, qty, type: "purchase", unitCost: round2(p.cost * (0.95 + rnd() * 0.1)), note: `Alibaba lot ${l + 1}` });
  }
});
stockMovements.push({ id: id("stk"), date: "2026-11-14", productId: "w610-black", qty: -2, type: "adjustment", note: "Demo units for Hondos display" });

const shipments = [
  { id: id("shp"), supplier: "Shenzhen factory (Alibaba)", reference: "PO-2026-031", orderedOn: addDays(ANCHOR, -18), eta: addDays(ANCHOR, 6), status: "In transit",
    items: [{ productId: "w610-photochromic", qty: 30, unitCost: 35.5 }, { productId: "w610-clear", qty: 20, unitCost: 35.5 }], freightCost: 240 },
  { id: id("shp"), supplier: "Shenzhen factory (Alibaba)", reference: "PO-2026-032", orderedOn: addDays(ANCHOR, -6), eta: addDays(ANCHOR, 24), status: "In production",
    items: [{ productId: "gs-05", qty: 40, unitCost: 21 }, { productId: "qy-pro-2-cycling", qty: 15, unitCost: 29 }], freightCost: 180 },
  { id: id("shp"), supplier: "Watch supplier (1688)", reference: "PO-2026-029", orderedOn: addDays(ANCHOR, -25), eta: addDays(ANCHOR, 1), status: "Customs",
    items: [{ productId: "v5-black", qty: 25, unitCost: 16.5 }], freightCost: 90 },
];

// ---------- expenses ----------
const expenses = [];
const exp = (date, category, description, supplier, amount) => expenses.push({ id: id("exp"), date, category, description, supplier, amount: round2(amount) });
months.forEach((m, mi) => {
  exp(`${m}-05`, "Epsilon Net", "Accounting & invoicing software", "Epsilon Net", 62);
  exp(`${m}-03`, "Skroutz", "Skroutz Marketplace subscription", "Skroutz SA", 49.6);
  exp(dayIn(m), "Marketing", pick(["Meta ads", "Instagram ads", "Google Ads"]), pick(["Meta", "Google"]), 80 + mi * 18 + int(0, 60));
  exp(dayIn(m), "Shipping", "Courier invoices", "ACS Courier", 40 + int(0, 50) + mi * 4);
  if (mi % 4 === 0) exp(dayIn(m), "Merchandise", "Factory order (see stock purchases)", "Alibaba", 1800 + int(0, 900));
  if (mi % 3 === 2) exp(dayIn(m), "Packaging", "Custom boxes & manuals", "Print shop", 120 + int(0, 120));
});
exp("2026-01-20", "GS1", "GS1 Greece annual membership + barcodes", "GS1 Association Greece", 186);
exp("2026-06-10", "Events", "Booth at Thessaloniki tech fair", "HELEXPO", 650);
exp("2026-11-12", "Events", "Retail display stand (advance)", "Stand maker", 690);
exp("2026-10-20", "Marketing", "Influencer collaboration", "Fitness creator", 420);
expenses.sort((a, b) => a.date.localeCompare(b.date));

// ---------- quotes ----------
const quotes = [
  { id: id("quo"), number: "Q-2026-014", date: addDays(ANCHOR, -3), validUntil: addDays(ANCHOR, 27), client: "Orion Logistics (mock)", contactEmail: "", lines: [{ productId: "w610-black", qty: 40, unitPrice: 92 }, { productId: "w610-photochromic", qty: 20, unitPrice: 92 }], discountPct: 5, customLogo: true, logoFeePerUnit: 4, status: "Sent", notes: "Christmas gifts for staff" },
  { id: id("quo"), number: "Q-2026-013", date: addDays(ANCHOR, -10), validUntil: addDays(ANCHOR, 20), client: "Plaisio", partnerId: "plaisio", contactEmail: "", lines: [{ productId: "w610-black", qty: 60, unitPrice: 82 }, { productId: "v5-black", qty: 40, unitPrice: 27 }], discountPct: 0, customLogo: false, logoFeePerUnit: 0, status: "Sent", notes: "Opening order proposal" },
  { id: id("quo"), number: "Q-2026-012", date: addDays(ANCHOR, -34), validUntil: addDays(ANCHOR, -4), client: "Nova Tech SA (mock)", partnerId: "nova-tech-sa-mock", contactEmail: "", lines: [{ productId: "w610-black", qty: 26, unitPrice: 85 }], discountPct: 3, customLogo: true, logoFeePerUnit: 4, status: "Accepted", notes: "" },
  { id: id("quo"), number: "Q-2026-011", date: addDays(ANCHOR, -48), validUntil: addDays(ANCHOR, -18), client: "Medilab (mock)", contactEmail: "", lines: [{ productId: "y13", qty: 50, unitPrice: 23 }], discountPct: 8, customLogo: true, logoFeePerUnit: 3, status: "Lost", notes: "Went with a cheaper supplier" },
  { id: id("quo"), number: "Q-2026-015", date: addDays(ANCHOR, -1), validUntil: addDays(ANCHOR, 29), client: "Athens Sports Club (mock)", partnerId: "athens-sports-club-mock", contactEmail: "", lines: [{ productId: "gs-05", qty: 30, unitPrice: 40 }], discountPct: 0, customLogo: false, logoFeePerUnit: 0, status: "Draft", notes: "Spring events" },
];

// ---------- marketing ----------
const campaigns = [
  { id: id("cmp"), name: "Fitness creator collab", handle: "@fit.creator", platform: "Instagram", cost: 420, status: "Done", date: "2026-10-20", reach: 48000, clicks: 1350, sales: 9, notes: "Reel + 3 stories with W610" },
  { id: id("cmp"), name: "Tech reviewer", handle: "@techreview.gr", platform: "YouTube", cost: 260, status: "Live", date: "2026-11-03", reach: 22000, clicks: 610, sales: 4, notes: "Unboxing video" },
  { id: id("cmp"), name: "Product video", handle: "videographer", platform: "TikTok", cost: 90, status: "Done", date: "2026-11-08", reach: 9000, clicks: 140, sales: 1, notes: "Short product video" },
  { id: id("cmp"), name: "Cycling club ambassador", handle: "@cycling.athens", platform: "Instagram", cost: 150, status: "Agreed", date: addDays(ANCHOR, 8), reach: null, clicks: null, sales: null, notes: "QY-pro 2 Cycling" },
  { id: id("cmp"), name: "Christmas gift guide", handle: "@lifestyle.gr", platform: "Instagram", cost: 300, status: "Contacted", date: addDays(ANCHOR, 12), reach: null, clicks: null, sales: null, notes: "" },
  { id: id("cmp"), name: "Running event booth", handle: "Athens Marathon expo", platform: "Event", cost: 400, status: "Idea", date: "2027-03-15", reach: null, clicks: null, sales: null, notes: "" },
];
const content = [];
const ctitles = [["Instagram", "W610 Photochromic — indoor/outdoor reel", "w610-photochromic"], ["TikTok", "Take a call with your glasses", "w610-black"], ["Instagram", "Christmas gift guide carousel", ""], ["Facebook", "Hondos Center — find us in store", ""], ["Instagram", "Cycling with QY-pro 2", "qy-pro-2-cycling"], ["TikTok", "V5 vs Y13 — which smartwatch?", "v5-black"], ["YouTube", "W610 unboxing & setup", "w610-black"], ["Instagram", "Customer story: corporate gifts", "gs-05"], ["Instagram", "Behind the scenes: private label boxes", ""], ["TikTok", "3 ways to wear W610", "w610-clear"]];
ctitles.forEach(([platform, title, productId], i) => {
  const date = addDays(ANCHOR, -8 + i * 3);
  content.push({ id: id("cnt"), date, platform, title, status: date < ANCHOR ? "Published" : i % 3 === 0 ? "In progress" : "Planned", productId: productId || undefined });
});

// ---------- tasks ----------
const now = `${ANCHOR}T09:00:00.000Z`;
const t = (title, priority, due, extra = {}) => ({ id: id("tsk"), title, priority, due, done: false, createdAt: now, ...extra });
const tasks = [
  t("Send revised wholesale price list to Plaisio", "High", addDays(ANCHOR, -1), { partnerId: "plaisio" }),
  t("Confirm customs clearance for V5 shipment", "High", addDays(ANCHOR, 0)),
  t("Prepare Christmas display for Hondos stores", "Medium", addDays(ANCHOR, 3), { partnerId: "hondos-center" }),
  t("Order EAN codes for GS and watch models", "Medium", addDays(ANCHOR, 7)),
  t("Book samples for Pool Sport meeting", "Medium", addDays(ANCHOR, 4), { partnerId: "pool-sport" }),
  t("Update Skroutz listings with new photos", "Low", addDays(ANCHOR, 10)),
  t("Pay 2nd half of display stand", "Medium", addDays(ANCHOR, 14)),
  { ...t("Ship Nova Tech order", "High", addDays(ANCHOR, -30), { partnerId: "nova-tech-sa-mock" }), done: true },
  { ...t("Renew GS1 membership", "Low", "2026-01-25"), done: true },
];

// ---------- Skroutz funnel (mock) ----------
const skroutzStats = months.map((m) => {
  const o = orders.filter((x) => x.channel === "Skroutz" && x.date.startsWith(m)).length;
  const visits = Math.round(o / (0.018 + rnd() * 0.012));
  return { month: m, visits, orders: o };
});

const files = { settings, products, stockMovements, shipments, orders, expenses, partners, quotes, campaigns, content, tasks, skroutzStats };
for (const [name, data] of Object.entries(files)) writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
console.log("Seed written:", Object.entries(files).map(([k, v]) => `${k}${Array.isArray(v) ? `(${v.length})` : ""}`).join(", "));
