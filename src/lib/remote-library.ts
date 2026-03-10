import { apiFetch } from "@/lib/api-client";

export type RemoteScope = "mine" | "all";
export type RemoteSearchType = "projects" | "samples" | "both";

export interface RemoteProjectSummary {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  childProjectCount: number;
  sampleCount: number;
}

export interface RemoteSampleSummary {
  id: string;
  name: string;
  ownerId: string;
  projectId: string;
  projectName: string;
  credits: number;
  sizeBytes: number | null;
  contentType: string;
  isOwner: boolean;
  inCollection: boolean;
  canDownload: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteSearchResponse {
  projects: RemoteProjectSummary[];
  samples: RemoteSampleSummary[];
}

export interface RemoteProjectDownloadManifest {
  project: {
    id: string;
    name: string;
    ownerId: string;
    isOwner: boolean;
  };
  samples: Array<{
    id: string;
    name: string;
    relativePath: string;
    projectId: string;
    credits: number;
    sizeBytes: number | null;
    contentType: string;
  }>;
}

export interface CreateSampleUploadUrlInput {
  projectId: string;
  fileName: string;
  contentType: string;
  sizeBytes?: number;
  credits: number;
}

export interface CreateSampleRecordInput {
  projectId: string;
  name: string;
  s3Key: string;
  contentType: string;
  sizeBytes?: number;
  credits: number;
}

export async function searchRemoteLibrary(params: {
  q?: string;
  scope: RemoteScope;
  types: RemoteSearchType;
  limit?: number;
}): Promise<RemoteSearchResponse> {
  const qs = new URLSearchParams();
  qs.set("scope", params.scope);
  qs.set("types", params.types);
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.limit) qs.set("limit", String(params.limit));

  const res = await apiFetch(`/api/library/search?${qs.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to query remote library (${res.status})`);
  }
  return (await res.json()) as RemoteSearchResponse;
}

export async function addSampleToCollection(sampleId: string): Promise<void> {
  const res = await apiFetch(`/api/library/samples/${encodeURIComponent(sampleId)}/add-to-collection`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to add sample to collection (${res.status})`);
  }
}

export async function downloadRemoteSampleBlob(sampleId: string): Promise<Blob> {
  const res = await apiFetch(`/api/library/samples/${encodeURIComponent(sampleId)}/download`);
  if (!res.ok) {
    throw new Error(`Failed to download sample (${res.status})`);
  }
  return await res.blob();
}

export async function getProjectDownloadManifest(projectId: string): Promise<RemoteProjectDownloadManifest> {
  const res = await apiFetch(`/api/library/projects/${encodeURIComponent(projectId)}/download-manifest`);
  if (!res.ok) {
    throw new Error(`Failed to get project manifest (${res.status})`);
  }
  return (await res.json()) as RemoteProjectDownloadManifest;
}

export async function createSampleUploadUrl(input: CreateSampleUploadUrlInput): Promise<{
  key: string;
  uploadUrl: string;
  expiresIn: number;
}> {
  const res = await apiFetch("/api/library/samples/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Failed to create sample upload URL (${res.status})`);
  }
  const payload = (await res.json()) as { key: string; uploadUrl: string; expiresIn: number };
  return payload;
}

export async function completeSampleCreate(input: CreateSampleRecordInput): Promise<RemoteSampleSummary> {
  const res = await apiFetch("/api/library/samples", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Failed to create sample record (${res.status})`);
  }
  return (await res.json()) as RemoteSampleSummary;
}
