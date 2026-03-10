import { Link } from "@tanstack/react-router";

export function HomeFooter() {
  return (
    <footer className="shrink-0 border-t border-border bg-card px-4 py-3 flex flex-wrap items-center justify-center sm:justify-between gap-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1">
        <Link to="/legal/terms" className="text-primary hover:underline">
          Terms of Service
        </Link>
        <Link to="/legal/privacy" className="text-primary hover:underline">
          Privacy Policy
        </Link>
        <span className="hidden sm:inline">We don&apos;t use cookies or collect personal data.</span>
      </div>
      <span className="sm:hidden text-xs text-center">No cookies or personal data.</span>
    </footer>
  );
}
