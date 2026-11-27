import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

/** Shows the error instead of a blank screen, so problems on a phone can be reported with a screenshot. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, color: "#fff", fontFamily: "Inter, system-ui, sans-serif", maxWidth: 560, margin: "10vh auto" }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Innometrics could not start</h1>
        <p style={{ opacity: 0.75, fontSize: 14 }}>Your data is safe. Take a screenshot of this message and send it to Claude.</p>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "rgba(255,255,255,0.08)", padding: 12, borderRadius: 10, marginTop: 12 }}>{String(this.state.error?.stack || this.state.error)}</pre>
        <button onClick={() => location.reload()} style={{ marginTop: 12, padding: "10px 16px", borderRadius: 10, border: 0, background: "#7c3aed", color: "#fff", fontWeight: 600 }}>Try again</button>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
document.getElementById("boot")?.remove();
