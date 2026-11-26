import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-glow-violet/30 to-glow-cyan/10 ring-1 ring-white/15">
        <Icon size={24} className="text-glow-cyan" />
      </span>
      <h3 className="heading text-xs text-white">{title}</h3>
      {text && <p className="max-w-sm text-sm text-white/55">{text}</p>}
      {action}
    </div>
  );
}
