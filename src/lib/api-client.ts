/**
 * Fetch wrapper for /api/* endpoints.
 * Adds X-Client-Version for server compatibility checks.
 */
const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("X-Client-Version", appVersion);

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}
