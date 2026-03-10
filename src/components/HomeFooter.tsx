import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const STORAGE_KEY = "octacard-footer-closed";

export function HomeFooter() {
  const [closed, setClosed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    if (closed) {
      localStorage.setItem(STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [closed]);

  if (closed) return null;

  return (
    <footer className="shrink-0 border-t border-border bg-card px-4 py-3 flex flex-wrap items-center justify-center sm:justify-between gap-3 text-sm text-muted-foreground relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={() => setClosed(true)}
        aria-label="Close footer"
      >
        <X className="h-4 w-4" />
      </Button>
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 pr-8">
        <Link to="/legal/terms" className="text-primary hover:underline">
          Terms of Service
        </Link>
        <Link to="/legal/privacy" className="text-primary hover:underline">
          Privacy Policy
        </Link>
        <span className="hidden sm:inline">We don&apos;t use cookies or collect personal data.</span>
      </div>
      <span className="sm:hidden text-xs text-center pr-8">No cookies or personal data.</span>
    </footer>
  );
}
