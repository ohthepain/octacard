/**
 * Fetch wrapper for /api/* endpoints.
 * Adds X-Client-Version for server compatibility checks.
 * Adds ngrok-skip-browser-warning when served via ngrok to bypass interstitial page.
 */
const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";

function isNgrokOrigin(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.includes("ngrok-free.dev");
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("X-Client-Version", appVersion);
  if (isNgrokOrigin()) {
    headers.set("ngrok-skip-browser-warning", "1");
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}
