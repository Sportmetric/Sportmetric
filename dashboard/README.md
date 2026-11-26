# Innometrics Control Center

Internal admin dashboard for **Innometrics** (INNOWARE ΜΟΝΟΠΡΟΣΩΠΗ ΙΚΕ): smartglasses, smartwatches and smartrings sold via Skroutz, retail partners and B2B corporate orders.

For internal use only. This is not a public website.

## Run it

Requires Node.js 18 or newer.

```bash
cd dashboard
npm install
npm run dev        # http://localhost:5173/#overview
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Shortcuts: **⌘K / Ctrl+K** opens the command palette to search orders, partners, products and pages.

## Pages

| Route | What it does |
|---|---|
| `#overview` | Greeting and attention count. KPIs: revenue this month, net profit, orders, units in stock, low-stock alerts, open B2B quotes, follow-ups due, Skroutz conversion. Revenue-by-month chart (3/6/12 months) and a donut of revenue by channel. |
| `#/orders` | Filterable orders table (channel, status, date, search) with **profit per order**. "Record an order" modal with a live profit breakdown. CSV export. |
| `#/inventory` | Card per SKU: stock bar, average cost, Skroutz/retail/wholesale prices, per-unit margin, low-stock badge. Incoming shipments with "mark arrived", plus receive and adjust stock. |
| `#/partners` | CRM kanban (Lead → Contacted → Meeting → Negotiation → Active) with drag and drop, follow-up dates, notes, activity timeline and a **follow-up email drafter** (Greek or English). |
| `#/quotes` | B2B quotes: client, products, quantity, discount, custom-logo fee, automatic totals with VAT, status (Draft/Sent/Accepted/Lost) and **Export PDF**. |
| `#/finance` | Income vs expenses, expenses by category, monthly profit table, add expenses, CSV export. |
| `#/marketing` | Influencer and collab tracker (cost, reach, clicks, sales, cost per sale) and a monthly content calendar. |
| `#/tasks` | To-dos with priority, due date and a linked partner or order. |
| `#/report` | Weekly report generated from sales, profit, stock, follow-ups and tasks, with a **Copy** button. |
| `#/settings` | Company info, VAT %, Skroutz commission, currency, low-stock threshold, and backup import/export. |

## How the numbers are calculated

All logic is in `src/lib/calc.ts`. It has no React code, so it can be reused or tested on its own.

- **Prices are entered including VAT**, as in the product catalogue.
- **Order profit** = gross ÷ (1 + VAT) − Skroutz commission (Skroutz orders only, on the VAT-exclusive amount) − product cost − shipping we paid. This is the same formula as the catalogue spreadsheet: `(price × (1 − 10.54%)) / 1.24 − landed cost`.
- **Product cost** is the weighted average of purchase costs for that SKU. If there are no purchases with a cost, the product's catalogue cost is used. An order can also override its cost.
- **Stock** = purchases + adjustments − units in orders that are not cancelled or returned.
- **Net profit** = order profit − operating expenses. Operating expenses are all expenses except *Merchandise*, because stock purchases reach profit as product cost when the stock is sold.
- **Cash result** (Finance) = income − all expenses, merchandise included.

## Data: where it lives and how to plug in real data

```
src/data/
  types.ts        typed models (Product, Order, Expense, Partner, Quote, …) and the Database shape
  store.tsx       React store: seed JSON → state → localStorage
  seed/*.json     sample data, one file per collection
scripts/
  generate-mock.mjs   regenerates seed/*.json (npm run mock)
```

- On first load the app uses `src/data/seed/*.json`. Every edit is then saved to the browser's **localStorage**, so changes survive reloads. They stay on that computer and browser only.
- **The seed data is illustrative.** The SKUs, EANs and public Skroutz and retail prices match the real catalogue. Unit costs, wholesale prices, orders, expenses, quotes and campaigns are mock values, because this repository is public.
- **Use your real data:** go to *Settings → Import backup* and choose a JSON file in the `Database` shape from `types.ts`. *Settings → Export backup* downloads the current data in the same format. Keep real backups out of git: `*.backup.json` and `private-data/` are already in `.gitignore`.
- **Replace the seed instead:** overwrite the files in `src/data/seed/` and run *Settings → Reset to sample data* (or clear localStorage).
- **Connect a backend later:** replace `loadDatabase` and `saveDatabase` in `store.tsx` with API calls. The pages only use the `useStore()` hook, so nothing else needs to change.

## Structure

```
src/
  components/   GlassCard, StatsCard, DataTable, Modal/ConfirmModal, Badge, Charts (bar/line/donut),
                CountUp, Skeleton, EmptyState, Toast, CommandPalette, Layout (sidebar, top bar, mobile sheet)
  pages/        Overview, Orders, Inventory, Partners, Quotes, Finance, Marketing, Tasks, WeeklyReport, Settings
  lib/          calc.ts (business logic), format.ts (€, dates, CSV), router.ts (hash routing)
  data/         types, store, seed JSON
```

Stack: React 18, Vite 5, TypeScript, Tailwind CSS 3, framer-motion, lucide-react and Recharts.

## Private online version (claude.ai)

The same build also runs as a private claude.ai Artifact. There, `src/lib/platform.ts` stores data in the Artifact's own database instead of the browser's, so the data follows your claude.ai account across devices. Downloads go through claude.ai. Quotes download as a print-ready page: open it and choose *Save as PDF*.

Routes are plain hashes such as `#orders`. The older `#/orders` form also works.

## Notes

- **PDF export** opens the browser's print dialog with a clean A4 quote layout. Choose "Save as PDF".
- The **email drafter** fills a template locally from the partner's details and timeline. Nothing is sent anywhere: copy the text or open it in your mail app.
- **Skroutz conversion** needs monthly visit numbers (`skroutzStats`). Until you add them, the card shows "—".
