import { apiFetch } from "@/lib/api-client";

export interface AdminNetworkTrace {
  id: string;
  timestamp: string;
  transport: "http" | "aws-sdk";
  service: string;
  operation: string;
  method: string | null;
  target: string | null;
  statusCode: number | null;
  durationMs: number;
  ok: boolean;
  error: string | null;
}

async function parseError(res: Response, fallback: string): Promise<Error> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) return new Error(data.error);
  } catch {
    // Ignore parse failures and return fallback.
  }
  return new Error(fallback);
}

export async function getAdminNetworkTraces(options?: {
  limit?: number;
  errorsOnly?: boolean;
}): Promise<AdminNetworkTrace[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.errorsOnly) params.set("errorsOnly", "true");

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const res = await apiFetch(`/api/admin/network/traces${suffix}`);
  if (!res.ok) throw await parseError(res, `Failed to load traces (${res.status})`);

  const data = (await res.json()) as { traces?: AdminNetworkTrace[] };
  return data.traces ?? [];
}

export async function clearAdminNetworkTraces(): Promise<void> {
  const res = await apiFetch("/api/admin/network/traces", { method: "DELETE" });
  if (!res.ok) throw await parseError(res, `Failed to clear traces (${res.status})`);
}
