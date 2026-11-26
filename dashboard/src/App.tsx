import { MotionConfig } from "framer-motion";
import { Layout } from "./components/Layout";
import { PageSkeleton } from "./components/Skeleton";
import { ToastProvider } from "./components/Toast";
import { StoreProvider, useStore } from "./data/store";
import { useHashRoute, type RouteId } from "./lib/router";
import { Overview } from "./pages/Overview";
import { Orders } from "./pages/Orders";
import { Inventory } from "./pages/Inventory";
import { Partners } from "./pages/Partners";
import { Quotes } from "./pages/Quotes";
import { Finance } from "./pages/Finance";
import { Marketing } from "./pages/Marketing";
import { Tasks } from "./pages/Tasks";
import { WeeklyReport } from "./pages/WeeklyReport";
import { SettingsPage } from "./pages/Settings";

const PAGES: Record<RouteId, () => JSX.Element> = {
  overview: Overview, orders: Orders, inventory: Inventory, partners: Partners, quotes: Quotes,
  finance: Finance, marketing: Marketing, tasks: Tasks, report: WeeklyReport, settings: SettingsPage,
};

function Shell() {
  const route = useHashRoute();
  const { ready } = useStore();
  const Page = PAGES[route];
  return <Layout route={route}>{ready ? <Page /> : <PageSkeleton />}</Layout>;
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </StoreProvider>
    </MotionConfig>
  );
}
