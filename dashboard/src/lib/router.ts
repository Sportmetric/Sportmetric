import { useEffect, useRef, useState } from "react";

export type RouteId = "overview" | "orders" | "inventory" | "partners" | "quotes" | "finance" | "marketing" | "tasks" | "report" | "settings";
export const ROUTES: RouteId[] = ["overview", "orders", "inventory", "partners", "quotes", "finance", "marketing", "tasks", "report", "settings"];

function parse(): RouteId {
  const h = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0]; // accepts #orders and #/orders
  return (ROUTES as string[]).includes(h) ? (h as RouteId) : "overview";
}

/** Minimal hash router: #/overview, #/orders, … */
export function useHashRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(parse);
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", "#overview");
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const navigate = (r: RouteId) => { window.location.hash = `#${r}`; };

let pendingNew: RouteId | null = null;
const current = () => window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];

/** Navigate to a page and open its "create" form (used by quick actions). */
export function openNew(r: RouteId) {
  if (current() === r) window.dispatchEvent(new CustomEvent("im:new", { detail: r }));
  else { pendingNew = r; navigate(r); }
}

/** Runs `open` when a quick action asks this page to create something. */
export function useNewAction(r: RouteId, open: () => void) {
  const cb = useRef(open);
  cb.current = open;
  useEffect(() => {
    if (pendingNew === r) { pendingNew = null; cb.current(); }
    const on = (e: Event) => { if ((e as CustomEvent).detail === r) cb.current(); };
    window.addEventListener("im:new", on);
    return () => window.removeEventListener("im:new", on);
  }, [r]);
}
