import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Boxes, CalendarCheck2, FileSpreadsheet, FileText, Handshake, LayoutDashboard, LineChart, Megaphone, Menu, Search, Settings as SettingsIcon, ShoppingBag, X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../data/store";
import { attentionItems, nav_counts } from "../lib/calc";
import type { RouteId } from "../lib/router";
import { CommandPalette } from "./CommandPalette";
import logoMark from "../assets/im-mark.jpg";

export interface NavItem { id: RouteId; label: string; icon: LucideIcon; count?: number; tone?: "rose" | "amber" | "cyan" }

function useNav(): { group: string; items: NavItem[] }[] {
  const { db } = useStore();
  const c = useMemo(() => nav_counts(db), [db]);
  return [
    { group: "Command", items: [{ id: "overview", label: "Overview", icon: LayoutDashboard }, { id: "report", label: "Weekly Report", icon: FileText }] },
    {
      group: "Sales",
      items: [
        { id: "orders", label: "Orders", icon: ShoppingBag, count: c.orders, tone: "cyan" },
        { id: "quotes", label: "B2B Quotes", icon: FileSpreadsheet, count: c.quotes, tone: "cyan" },
        { id: "partners", label: "Partners", icon: Handshake, count: c.partners, tone: "rose" },
      ],
    },
    {
      group: "Operations",
      items: [
        { id: "inventory", label: "Inventory", icon: Boxes, count: c.inventory, tone: "amber" },
        { id: "finance", label: "Finance", icon: LineChart },
        { id: "marketing", label: "Marketing", icon: Megaphone },
        { id: "tasks", label: "Tasks", icon: CalendarCheck2, count: c.tasks, tone: "rose" },
      ],
    },
    { group: "System", items: [{ id: "settings", label: "Settings", icon: SettingsIcon }] },
  ];
}

const countTone = { rose: "bg-glow-rose text-navy-950", amber: "bg-glow-amber text-navy-950", cyan: "bg-white/15 text-white" };

function Logo() {
  return (
    <a href="#overview" className="flex items-center gap-3 px-2">
      <img src={logoMark} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover mix-blend-screen" />
      <span className="leading-tight">
        <span className="brand-text block font-display text-[13px] font-semibold tracking-[0.2em]">INNOMETRICS</span>
        <span className="block text-[11px] font-medium tracking-wide text-white/50">Control Center</span>
      </span>
    </a>
  );
}

function NavList({ route, onNavigate }: { route: RouteId; onNavigate?: () => void }) {
  const nav = useNav();
  return (
    <nav className="space-y-6" aria-label="Main">
      {nav.map((g) => (
        <div key={g.group}>
          <div className="label mb-2 px-3 text-white/40">{g.group}</div>
          <ul className="space-y-1">
            {g.items.map((it) => {
              const active = it.id === route;
              const Icon = it.icon;
              return (
                <li key={it.id} className="relative">
                  {active && <motion.span layoutId="nav-glow" className="absolute inset-0 rounded-xl bg-gradient-to-r from-glow-cyan/25 to-glow-violet/20 shadow-glow ring-1 ring-white/25" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                  <a href={`#${it.id}`} onClick={onNavigate} aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white"}`}>
                    <Icon size={18} className={active ? "text-glow-cyan drop-shadow-[0_0_8px_rgba(94,231,255,0.8)]" : ""} />
                    <span className="flex-1">{it.label}</span>
                    {!!it.count && <span className={`num min-w-[1.4rem] rounded-full px-1.5 text-center text-[11px] font-bold leading-5 ${countTone[it.tone ?? "cyan"]}`}>{it.count}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Notifications() {
  const { db } = useStore();
  const items = useMemo(() => attentionItems(db), [db]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/[0.12] hover:text-white" aria-label={`Notifications (${items.length})`} aria-expanded={open}>
        <Bell size={18} />
        {items.length > 0 && <span className="num absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-glow-rose px-1 text-[10px] font-bold text-navy-950 ring-2 ring-[#1c1356]">{items.length}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
              className="glass-card absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden border-white/25 bg-[#1a1450]/90">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><span className="heading text-xs">Needs attention</span><span className="chip">{items.length}</span></div>
              <ul className="max-h-[60vh] overflow-y-auto py-1">
                {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-white/55">All clear. Nothing needs you right now.</li>}
                {items.map((n) => (
                  <li key={n.id}>
                    <a href={n.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-2.5 hover:bg-white/[0.06]">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.severity === "high" ? "bg-glow-rose" : "bg-glow-amber"}`} />
                      <span className="min-w-0"><span className="block text-sm text-white">{n.title}</span><span className="block text-xs text-white/50">{n.detail}</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Layout({ route, children }: { route: RouteId; children: ReactNode }) {
  const { db, saveError } = useStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const initials = db.settings.userName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setSheetOpen(false), [route]);
  useEffect(() => { document.documentElement.dataset.bg = db.settings.background ?? "neon"; }, [db.settings.background]);

  return (
    <div className="relative min-h-screen">
      {/* ambient colour blobs */}
      <div className="blob left-[-120px] top-[-80px] h-[380px] w-[380px]" style={{ background: "var(--blob-1)" }} />
      <div className="blob right-[-140px] top-[30%] h-[420px] w-[420px]" style={{ background: "var(--blob-2)" }} />
      <div className="blob bottom-[-160px] left-[30%] h-[360px] w-[360px] opacity-30" style={{ background: "var(--blob-3)" }} />

      {/* desktop sidebar */}
      <aside className="glass-card fixed bottom-4 left-4 top-4 z-30 hidden w-[248px] flex-col gap-8 overflow-y-auto rounded-3xl p-4 lg:flex">
        <div className="pt-1"><Logo /></div>
        <NavList route={route} />
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-xs text-white/55">
          <div className="font-semibold text-white/80">{db.settings.companyName}</div>
          <div className="mt-0.5">Internal use only</div>
        </div>
      </aside>

      <div className="relative z-10 lg:pl-[272px]">
        {/* top bar */}
        <header className="sticky top-0 z-20 px-4 pb-2 pt-4 sm:px-6">
          <div className="glass-card flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-4">
            <a href="#overview" className="lg:hidden" aria-label="Overview"><img src={logoMark} alt="" className="h-10 w-10 rounded-xl object-cover mix-blend-screen" /></a>
            <button onClick={() => setPaletteOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-sm text-white/50 transition hover:bg-white/[0.1] sm:max-w-md">
              <Search size={16} className="shrink-0" />
              <span className="truncate">Search orders, partners, products…</span>
              <kbd className="ml-auto hidden rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 font-sans text-[11px] text-white/70 sm:inline">⌘K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {saveError && <span className="chip hidden border-glow-rose/40 text-glow-rose sm:inline-flex">Not saved: browser storage is full or blocked</span>}
              <Notifications />
              <div className="flex items-center gap-3 rounded-xl py-1 pl-1 pr-1 sm:pr-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-glow-pink to-glow-violet font-display text-xs font-bold text-white ring-2 ring-white/25">{initials}</span>
                <span className="hidden leading-tight md:block">
                  <span className="block text-sm font-semibold text-white">{db.settings.userName}</span>
                  <span className="block text-xs text-white/50">{db.settings.userRole}</span>
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 pb-28 pt-4 sm:px-6 lg:pb-10">
          <AnimatePresence mode="wait">
            <motion.div key={route} initial={{ opacity: 0, y: 14, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8, filter: "blur(4px)" }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* mobile bottom bar + bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        <div className="glass-card flex items-center justify-around rounded-2xl bg-[#1c1356]/70 px-2 py-2">
          {([["overview", LayoutDashboard, "Home"], ["orders", ShoppingBag, "Orders"], ["inventory", Boxes, "Stock"], ["partners", Handshake, "Partners"]] as const).map(([id, Icon, label]) => (
            <a key={id} href={`#${id}`} className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-[10px] font-semibold ${route === id ? "text-glow-cyan" : "text-white/60"}`}>
              <Icon size={20} />{label}
            </a>
          ))}
          <button onClick={() => setSheetOpen(true)} className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-[10px] font-semibold text-white/60" aria-label="Open menu"><Menu size={20} />More</button>
        </div>
      </div>
      <AnimatePresence>
        {sheetOpen && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
            <motion.div drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => i.offset.y > 120 && setSheetOpen(false)}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="glass-card absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-b-none rounded-t-3xl border-white/25 bg-[#1a1450]/90 p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/30" />
              <div className="mb-5 flex items-center justify-between"><Logo /><button onClick={() => setSheetOpen(false)} className="rounded-lg p-2 text-white/60" aria-label="Close menu"><X size={18} /></button></div>
              <NavList route={route} onNavigate={() => setSheetOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
