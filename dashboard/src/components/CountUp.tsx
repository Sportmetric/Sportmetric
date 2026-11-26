import { animate, useMotionValue, useTransform, motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";

/** Animated number that counts up to `value` and re-animates when it changes. */
export function CountUp({ value, format, duration = 1.1 }: { value: number; format: (v: number) => string; duration?: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const c = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, duration, mv, reduce]);
  return <motion.span className="num">{text}</motion.span>;
}
