import { Link } from "react-router";
import { Home, Terminal } from "lucide-react";
import { Panel, StatusDot } from "@/components/terminal";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="rise flex min-h-[60vh] items-center justify-center">
      <Panel className="w-full max-w-md p-6 text-center">
        <div className="mx-auto flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Terminal className="size-3.5 text-primary" />
          <span>
            neurobot@local <span className="text-border">~</span> $ cd
            <span className="text-foreground"> unknown</span>
          </span>
          <StatusDot tone="rose" pulse />
        </div>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">
          <span className="text-primary">404</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          command not found: that page doesn't exist in this brain.
        </p>
        <Button asChild size="sm" className="mt-5">
          <Link to="/">
            <Home className="size-3.5" />
            Back to dashboard
          </Link>
        </Button>
      </Panel>
    </div>
  );
}
