import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import React, { StrictMode, memo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { PrefsProvider } from "@/components/PrefsProvider";

// Eager static imports — lazy route chunks caused a visible compile/parse
// delay on first navigation in dev (the "laggy tab switch"). The app is one
// product, so there is no real code-splitting win to trade for it.
import AppShell from "./components/AppShell.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Brain from "./pages/Brain.tsx";
import Notes from "./pages/Notes.tsx";
import Ideas from "./pages/Ideas.tsx";
import Knowledge from "./pages/Knowledge.tsx";
import Goals from "./pages/Goals.tsx";
import Connections from "./pages/Connections.tsx";
import Settings from "./pages/Settings.tsx";
import NotFound from "./pages/NotFound.tsx";

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteSyncer() {
  const pathname = useLocation().pathname;

  React.useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: pathname },
      "*",
    );
  }, [pathname]);

  React.useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

// Never re-renders; kept out of the router's render work.
const MemoRouteSyncer = memo(RouteSyncer);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      {/* Phase 1: no auth — the whole app is the prototype */}
      <BrowserRouter>
        <PrefsProvider>
          <MemoRouteSyncer />
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/brain" element={<Brain />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/ideas" element={<Ideas />} />
              <Route path="/knowledge" element={<Knowledge />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/connections" element={<Connections />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          <Toaster />
        </PrefsProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>,
);
