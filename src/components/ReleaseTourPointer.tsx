import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useReleaseTourStore } from "@/stores/release-tour-store";

const SHOW_ME_DURATION_MS = 4000;

/**
 * Renders a box around the target element and an animated arrow when "Show me" is active.
 * No overlay/dimming - just the pointer.
 */
export function ReleaseTourPointer() {
  const { isActive, steps, showMeStepIndex, clearShowMe } = useReleaseTourStore();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = showMeStepIndex != null ? steps[showMeStepIndex] : null;
  const selector = step?.instruction.highlight;

  useEffect(() => {
    if (!isActive || showMeStepIndex == null || !selector || typeof document === "undefined") {
      setTargetRect(null);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const updateRect = () => {
      try {
        const el = document.querySelector(selector);
        if (el) {
          setTargetRect(el.getBoundingClientRect());
          return el;
        } else {
          setTargetRect(null);
          return null;
        }
      } catch {
        setTargetRect(null);
        return null;
      }
    };

    const el = updateRect();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });

    timeoutRef.current = setTimeout(clearShowMe, SHOW_ME_DURATION_MS);

    const resizeObserver = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateRect);
    });
    if (el) resizeObserver.observe(el);

    const interval = setInterval(updateRect, 200);

    return () => {
      clearInterval(interval);
      resizeObserver.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isActive, selector, showMeStepIndex, clearShowMe]);

  useEffect(() => {
    const handleClick = () => clearShowMe();
    if (showMeStepIndex != null) {
      document.addEventListener("click", handleClick, { once: true });
      return () => document.removeEventListener("click", handleClick);
    }
  }, [showMeStepIndex, clearShowMe]);

  if (!isActive || showMeStepIndex == null || !targetRect) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] pointer-events-none"
      data-testid="release-tour-pointer"
      aria-hidden
    >
      {/* Box around target */}
      <div
        className="absolute border-2 border-primary rounded-md animate-pulse"
        style={{
          left: targetRect.left - 4,
          top: targetRect.top - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
          boxShadow: "0 0 0 2px hsl(var(--primary) / 0.3)",
        }}
      />
      {/* Arrow pointing at element - positioned above, pointing down */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: targetRect.left + targetRect.width / 2 - 12,
          top: Math.max(8, targetRect.top - 36),
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-bounce"
        >
          <path d="M12 5v14M7 12l5 5 5-5" />
        </svg>
      </div>
    </div>,
    document.body
  );
}
