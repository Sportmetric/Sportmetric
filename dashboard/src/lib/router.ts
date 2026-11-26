import { useEffect, useState } from "react";

export type RouteId = "overview" | "orders" | "inventory" | "partners" | "quotes" | "finance" | "marketing" | "tasks" | "report" | "settings";
export const ROUTES: RouteId[] = ["overview", "orders", "inventory", "partners", "quotes", "finance", "marketing", "tasks", "report", "settings"];

function parse(): RouteId {
  const h = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return (ROUTES as string[]).includes(h) ? (h as RouteId) : "overview";
}

/** Minimal hash router: #/overview, #/orders, … */
export function useHashRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(parse);
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", "#/overview");
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const navigate = (r: RouteId) => { window.location.hash = `#/${r}`; };

/** True once when the hash carries "?new" (used by command-palette actions); clears the flag. */
export function consumeNewFlag(): boolean {
  if (!window.location.hash.includes("?new")) return false;
  window.history.replaceState(null, "", window.location.hash.replace("?new", ""));
  return true;
}
