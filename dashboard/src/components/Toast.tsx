import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; kind: ToastKind; text: string }

const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, kind, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3800);
  }, []);
  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info };
  const tone = { success: "text-glow-mint", error: "text-glow-rose", info: "text-glow-cyan" };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => {
            const I = Icon[t.kind];
            return (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }}
                className="glass-card pointer-events-auto flex w-full max-w-sm items-center gap-3 border-white/25 bg-navy-900/70 px-4 py-3">
                <I size={18} className={tone[t.kind]} />
                <span className="flex-1 text-sm text-white">{t.text}</span>
                <button className="text-white/50 hover:text-white" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Dismiss"><X size={15} /></button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
