import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  /** Lift the card on hover (default true). */
  hover?: boolean;
  padded?: boolean;
}

/** Frosted glass surface used for every panel in the app. */
export function GlassCard({ children, hover = true, padded = true, className = "", ...rest }: GlassCardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -5 } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`glass-card min-w-0 ${padded ? "p-5" : ""} ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="heading text-sm text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-white/55">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
