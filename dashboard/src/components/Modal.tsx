import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => panel.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus(), 60);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [open, onClose]);
  const width = { md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  // Portal to <body>: fixed positioning must not be trapped inside the animated page wrapper.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div ref={panel} role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className={`glass-card relative flex max-h-[92dvh] w-full ${width} flex-col overflow-hidden rounded-b-none border-white/25 bg-[#1a1450]/80 sm:rounded-2xl`}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="heading text-sm">{title}</h2>
                {subtitle && <p className="mt-1 text-xs text-white/55">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Inline "are you sure" confirmation (the app avoids native confirm dialogs). */
export function ConfirmModal({ open, onClose, onConfirm, title, text, confirmLabel = "Delete" }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; text: string; confirmLabel?: string }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button></>}>
      <p className="text-sm text-white/75">{text}</p>
    </Modal>
  );
}
