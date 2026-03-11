type ExternalApiTransport = "http" | "aws-sdk";

export interface ExternalApiTrace {
  id: string;
  timestamp: string;
  transport: ExternalApiTransport;
  service: string;
  operation: string;
  method: string | null;
  target: string | null;
  statusCode: number | null;
  durationMs: number;
  ok: boolean;
  error: string | null;
}

type TraceInput = Omit<ExternalApiTrace, "id" | "timestamp" | "durationMs"> & {
  startedAt: number;
};

const MAX_TRACES = 500;
const traces: ExternalApiTrace[] = [];

function truncate(input: string, maxLength = 240): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 3)}...`;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return truncate(error.message);
  if (typeof error === "string") return truncate(error);
  return "Unknown error";
}

export function recordExternalApiTrace(input: TraceInput): ExternalApiTrace {
  const item: ExternalApiTrace = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date(input.startedAt).toISOString(),
    transport: input.transport,
    service: input.service,
    operation: input.operation,
    method: input.method,
    target: input.target,
    statusCode: input.statusCode,
    durationMs: Math.max(0, Date.now() - input.startedAt),
    ok: input.ok,
    error: input.error ? truncate(input.error) : null,
  };

  traces.unshift(item);
  if (traces.length > MAX_TRACES) {
    traces.splice(MAX_TRACES);
  }

  return item;
}

export async function tracedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: {
    service: string;
    operation: string;
  },
): Promise<Response> {
  const startedAt = Date.now();
  const method = (init?.method ?? "GET").toUpperCase();
  const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  try {
    const response = await fetch(input, init);
    recordExternalApiTrace({
      startedAt,
      transport: "http",
      service: options.service,
      operation: options.operation,
      method,
      target: truncate(target),
      statusCode: response.status,
      ok: response.ok,
      error: null,
    });
    return response;
  } catch (error) {
    recordExternalApiTrace({
      startedAt,
      transport: "http",
      service: options.service,
      operation: options.operation,
      method,
      target: truncate(target),
      statusCode: null,
      ok: false,
      error: normalizeError(error),
    });
    throw error;
  }
}

export async function traceAwsCall<T>(
  options: {
    service: string;
    operation: string;
    target: string;
  },
  work: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await work();
    recordExternalApiTrace({
      startedAt,
      transport: "aws-sdk",
      service: options.service,
      operation: options.operation,
      method: null,
      target: truncate(options.target),
      statusCode: 200,
      ok: true,
      error: null,
    });
    return result;
  } catch (error) {
    recordExternalApiTrace({
      startedAt,
      transport: "aws-sdk",
      service: options.service,
      operation: options.operation,
      method: null,
      target: truncate(options.target),
      statusCode: null,
      ok: false,
      error: normalizeError(error),
    });
    throw error;
  }
}

export function getExternalApiTraces(options?: {
  limit?: number;
  errorsOnly?: boolean;
}): ExternalApiTrace[] {
  const limit = Math.max(1, Math.min(options?.limit ?? 200, MAX_TRACES));
  const errorsOnly = options?.errorsOnly ?? false;
  const source = errorsOnly ? traces.filter((trace) => !trace.ok) : traces;
  return source.slice(0, limit);
}

export function clearExternalApiTraces(): void {
  traces.length = 0;
}
