/**
 * Innometrics Control Center — data model.
 *
 * Every collection below lives in one `Database` object. It is seeded from the JSON
 * files in `src/data/seed/` and then persisted to localStorage (see `store.tsx`).
 * To plug in real data, either replace the seed JSON files or use
 * Settings → Import backup with a file in the `Database` shape.
 */

export type ISODate = string; // "YYYY-MM-DD"

export type ProductCategory = "glasses" | "watch" | "ring";

export interface Product {
  id: string;
  sku: string;
  model: string;
  variant: string;
  category: ProductCategory;
  ean: string;
  /** Landed cost per unit (factory + packaging + freight), €, used when no purchase history exists. */
  cost: number | null;
  skroutzPrice: number | null; // € incl. VAT
  retailPrice: number | null; // € incl. VAT
  wholesalePrice: number | null; // € incl. VAT
  privateLabel: boolean;
  /** Optional photo URL; a styled placeholder is shown when empty. */
  image?: string;
}

export type StockMovementType = "purchase" | "adjustment";

/** Stock coming in (purchases) or manual corrections. Sales are derived from orders. */
export interface StockMovement {
  id: string;
  date: ISODate;
  productId: string;
  qty: number; // positive = in, negative = out (adjustments only)
  type: StockMovementType;
  unitCost?: number; // € per unit, purchases only
  note?: string;
}

export type ShipmentStatus = "Ordered" | "In production" | "In transit" | "Customs" | "Arrived";

export interface Shipment {
  id: string;
  supplier: string;
  reference: string;
  orderedOn: ISODate;
  eta: ISODate;
  status: ShipmentStatus;
  items: { productId: string; qty: number; unitCost?: number }[];
  freightCost?: number;
}

export type Channel = "Skroutz" | "Retail" | "B2B" | "Direct";
export type OrderStatus = "Pending" | "Paid" | "Shipped" | "Delivered" | "Returned" | "Cancelled";

export interface OrderItem {
  productId: string;
  qty: number;
  /** Selling price per unit, € incl. VAT. */
  unitPrice: number;
}

export interface Order {
  id: string;
  number: string;
  date: ISODate;
  channel: Channel;
  customer: string;
  status: OrderStatus;
  items: OrderItem[];
  /** Outbound shipping paid by Innometrics, €. */
  shippingCost: number;
  /** Product cost override (€ total). When empty, average purchase cost per SKU is used. */
  costOverride?: number | null;
  partnerId?: string;
  notes?: string;
}

export type ExpenseCategory =
  | "Skroutz"
  | "GS1"
  | "Epsilon Net"
  | "Marketing"
  | "Merchandise"
  | "Shipping"
  | "Packaging"
  | "Events"
  | "Other";

export interface Expense {
  id: string;
  date: ISODate;
  category: ExpenseCategory;
  description: string;
  supplier: string;
  amount: number; // € incl. VAT
}

export type PartnerStage = "Lead" | "Contacted" | "Meeting" | "Negotiation" | "Active";
export type PartnerType = "Retail chain" | "Store" | "Corporate" | "Marketplace" | "Distributor";

export interface Activity {
  id: string;
  date: ISODate;
  kind: "call" | "email" | "meeting" | "note" | "order";
  text: string;
}

export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  stage: PartnerStage;
  city: string;
  contactName: string;
  email: string;
  phone: string;
  nextFollowUp: ISODate | null;
  nextAction: string;
  notes: string;
  activities: Activity[];
}

export type QuoteStatus = "Draft" | "Sent" | "Accepted" | "Lost";

export interface QuoteLine {
  productId: string;
  qty: number;
  unitPrice: number; // € excl. VAT
}

export interface Quote {
  id: string;
  number: string;
  date: ISODate;
  validUntil: ISODate;
  client: string;
  contactEmail: string;
  partnerId?: string;
  lines: QuoteLine[];
  discountPct: number; // 0-100
  customLogo: boolean;
  /** Per-unit surcharge for private label (logo on box + Bluetooth name), € excl. VAT. */
  logoFeePerUnit: number;
  status: QuoteStatus;
  notes: string;
}

export type CampaignStatus = "Idea" | "Contacted" | "Agreed" | "Live" | "Done";
export type Platform = "Instagram" | "TikTok" | "YouTube" | "Facebook" | "Event" | "Other";

export interface Campaign {
  id: string;
  name: string;
  handle: string;
  platform: Platform;
  cost: number;
  status: CampaignStatus;
  date: ISODate;
  reach: number | null;
  clicks: number | null;
  sales: number | null;
  notes: string;
}

export interface ContentItem {
  id: string;
  date: ISODate;
  platform: Platform;
  title: string;
  status: "Planned" | "In progress" | "Published";
  productId?: string;
}

export type Priority = "High" | "Medium" | "Low";

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  due: ISODate | null;
  done: boolean;
  partnerId?: string;
  orderId?: string;
  createdAt: string;
}

export interface SkroutzStat {
  month: string; // "YYYY-MM"
  visits: number;
  orders: number;
}

export type BackgroundId = "neon" | "aurora" | "violet" | "ocean" | "midnight" | "sunset";

export interface Settings {
  companyName: string;
  brandName: string;
  vatNumber: string;
  address: string;
  email: string;
  phone: string;
  currency: "EUR";
  vatRate: number; // 0.24
  skroutzCommission: number; // 0.1054
  lowStockThreshold: number;
  defaultLogoFee: number;
  userName: string;
  userRole: string;
  /** Dashboard background theme (Settings → Appearance). */
  background?: BackgroundId;
}

export interface Database {
  version: 1;
  settings: Settings;
  products: Product[];
  stockMovements: StockMovement[];
  shipments: Shipment[];
  orders: Order[];
  expenses: Expense[];
  partners: Partner[];
  quotes: Quote[];
  campaigns: Campaign[];
  content: ContentItem[];
  tasks: Task[];
  skroutzStats: SkroutzStat[];
}

export type CollectionKey = Exclude<keyof Database, "version" | "settings">;
