import posthog from "posthog-js";

type Properties = Record<string, unknown>;

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
// Reverse proxy at /ph avoids ad blockers. Configured in vite.config.ts (dev) and vercel.json (prod).
const POSTHOG_PROXY_PATH = "/ph";

const SESSION_ID_KEY = "octacard_session_id";
const SESSION_STARTED_AT_KEY = "octacard_session_started_at";
const SESSION_START_SENT_KEY = "octacard_session_start_sent";

let didInit = false;
let didSendSessionEnd = false;

function safeNow(): number {
  return Date.now();
}

function randomId(): string {
  if (typeof window === "undefined") return "server";
  return window.crypto?.randomUUID?.() ?? `${safeNow()}-${Math.random().toString(16).slice(2)}`;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;

  const id = randomId();
  window.sessionStorage.setItem(SESSION_ID_KEY, id);
  window.sessionStorage.setItem(SESSION_STARTED_AT_KEY, String(safeNow()));
  return id;
}

function getSessionDurationMs(): number {
  if (typeof window === "undefined") return 0;
  const startedAt = Number(window.sessionStorage.getItem(SESSION_STARTED_AT_KEY) ?? safeNow());
  return Math.max(0, safeNow() - startedAt);
}

function hasConfig(): boolean {
  return Boolean(POSTHOG_KEY);
}

export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  if (!hasConfig()) return;
  if (didInit) return;
  didInit = true;

  posthog.init(POSTHOG_KEY!, {
    api_host: POSTHOG_PROXY_PATH,
    ui_host: "https://eu.posthog.com",
    defaults: "2026-01-30",
    autocapture: false,
    disable_session_recording: true,
    capture_pageview: "history_change",
    capture_pageleave: true,
    // "localStorage" means no cookies are used for persistence.
    persistence: "localStorage",
  });

  const sessionId = getSessionId();
  if (window.sessionStorage.getItem(SESSION_START_SENT_KEY) !== "1") {
    window.sessionStorage.setItem(SESSION_START_SENT_KEY, "1");
    posthog.capture("octacard_session_start", { session_id: sessionId });
  }

  const sendSessionEndOnce = () => {
    if (didSendSessionEnd) return;
    didSendSessionEnd = true;
    posthog.capture("octacard_session_end", {
      session_id: getSessionId(),
      duration_ms: getSessionDurationMs(),
    });
  };

  window.addEventListener("pagehide", sendSessionEndOnce);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      sendSessionEndOnce();
    }
  });
}

export function capture(event: string, properties: Properties = {}): void {
  if (!hasConfig()) return;
  // Ensure init has run before emitting.
  initAnalytics();
  posthog.capture(event, {
    session_id: getSessionId(),
    ...properties,
  });
}

