import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { X, ChevronUp } from "lucide-react";

const STORAGE_KEY = "octacard-footer-hidden";

export function HomeFooter() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setHidden(stored === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  const handleClose = () => {
    setHidden(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const handleShow = () => {
    setHidden(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  if (hidden) {
    return (
      <div className="shrink-0 border-t border-border bg-card/50 px-4 py-1.5 flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-foreground h-7"
          onClick={handleShow}
          aria-label="Show footer"
        >
          <ChevronUp className="w-4 h-4 mr-1" />
          Legal & Privacy
        </Button>
      </div>
    );
  }

  return (
    <footer className="shrink-0 border-t border-border bg-card px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link to="/legal/terms" className="text-primary hover:underline">
          Terms of Service
        </Link>
        <Link to="/legal/privacy" className="text-primary hover:underline">
          Privacy Policy
        </Link>
        <span className="hidden sm:inline">We don&apos;t use cookies or collect personal data for local file operations.</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="sm:hidden text-xs">No cookies or personal data for local files.</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={handleClose}
          aria-label="Close footer"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </footer>
  );
}
