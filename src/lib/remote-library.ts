import { apiFetch } from "@/lib/api-client";

export type RemoteScope = "mine" | "all" | "explore";
export type RemoteSearchType = "packs" | "samples" | "both";

export interface RemotePackSummary {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  childPackCount: number;
  sampleCount: number;
}

export interface RemotePackDetails {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  isOwner: boolean;
  coverImageS3Key: string | null;
  coverImageUrl: string | null;
  /** Same-origin proxy URL for embedding (avoids COEP issues in dialogs) */
  coverImageProxyUrl: string | null;
  isPublic: boolean;
  priceTokens: number;
  defaultSampleTokens: number;
  childPackCount: number;
  sampleCount: number;
}

export interface RemotePackContentsResponse {
  pack: { id: string; name: string; ownerId: string; isOwner: boolean };
  packs: RemotePackSummary[];
  samples: RemoteSampleSummary[];
}

export interface RemoteSampleSummary {
  id: string;
  name: string;
  ownerId: string;
  packId: string;
  packName: string;
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
  packs: RemotePackSummary[];
  samples: RemoteSampleSummary[];
}

export interface RemotePackDownloadManifest {
  pack: {
    id: string;
    name: string;
    ownerId: string;
    isOwner: boolean;
  };
  samples: Array<{
    id: string;
    name: string;
    relativePath: string;
    packId: string;
    credits: number;
    sizeBytes: number | null;
    contentType: string;
  }>;
}

export interface CreateSampleUploadUrlInput {
  packId: string;
  fileName: string;
  contentType: string;
  sizeBytes?: number;
  credits: number;
}

export interface CreateSampleRecordInput {
  packId: string;
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

export interface SampleAnalysisResponse {
  id: string;
  analysisStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  analysisError: string | null;
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
  attributes: Record<string, number>;
  taxonomy: Array<{ attribute: string; value: string; confidence: number }>;
  embeddings?: Array<{ model: string; modelVersion: string; dimensions: number }>;
}

export async function getSampleAnalysis(sampleId: string): Promise<SampleAnalysisResponse> {
  const res = await apiFetch(`/api/library/samples/${encodeURIComponent(sampleId)}/analysis`);
  if (!res.ok) {
    throw new Error(`Failed to fetch sample analysis (${res.status})`);
  }
  return (await res.json()) as SampleAnalysisResponse;
}

export async function retrySampleAnalysis(sampleId: string): Promise<void> {
  const res = await apiFetch(`/api/library/samples/${encodeURIComponent(sampleId)}/analysis/retry`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to queue sample analysis (${res.status})`);
  }
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

export async function checkSamplesExist(contentHashes: string[]): Promise<{ existing: string[]; missing: string[] }> {
  const res = await apiFetch("/api/library/samples/check-exist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentHashes }),
  });
  if (!res.ok) {
    throw new Error(`Failed to check samples (${res.status})`);
  }
  return res.json();
}

export async function getSampleUploadUrlByContent(params: {
  packId: string;
  contentHash: string;
  contentType: string;
  fileName: string;
}): Promise<{ key: string; uploadUrl: string; expiresIn: number }> {
  const res = await apiFetch("/api/library/samples/upload-url-by-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Failed to get upload URL (${res.status})`);
  }
  return res.json();
}

export async function createSampleFromContent(params: {
  packId: string;
  name: string;
  contentHash: string;
  contentType: string;
  sizeBytes?: number;
  credits: number;
}): Promise<RemoteSampleSummary> {
  const res = await apiFetch("/api/library/samples/from-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Failed to create sample (${res.status})`);
  }
  return res.json();
}

export async function createPack(params: {
  name: string;
  parentId?: string;
  isPublic?: boolean;
  priceTokens?: number;
  defaultSampleTokens?: number;
}): Promise<{
  id: string;
  name: string;
  ownerId: string;
  parentId: string | null;
  isPublic: boolean;
  priceTokens: number;
  defaultSampleTokens: number;
  coverImageS3Key: string | null;
  createdAt: string;
  updatedAt: string;
}> {
  const res = await apiFetch("/api/library/packs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Failed to create pack (${res.status})`);
  }
  return res.json();
}

export async function fetchUnsplashRandomPhoto(query?: string): Promise<Blob> {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("query", query.trim());
  params.set("_", String(Date.now())); // cache-bust so each roll gets a fresh image
  const url = `/api/library/unsplash/random-photo?${params}`;
  const res = await apiFetch(url);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Failed to fetch Unsplash image (${res.status})`);
  }
  return res.blob();
}

export async function getPackCoverUploadUrl(
  packId: string,
  contentType: string
): Promise<{ key: string; uploadUrl: string; expiresIn: number }> {
  const res = await apiFetch(`/api/library/packs/${encodeURIComponent(packId)}/cover-upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType }),
  });
  if (!res.ok) {
    throw new Error(`Failed to get pack cover upload URL (${res.status})`);
  }
  return res.json();
}

export async function updatePack(
  packId: string,
  data: {
    name?: string;
    parentId?: string | null;
    coverImageS3Key?: string | null;
    isPublic?: boolean;
    priceTokens?: number;
    defaultSampleTokens?: number;
  }
): Promise<void> {
  const res = await apiFetch(`/api/library/packs/${encodeURIComponent(packId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to update pack (${res.status})`);
  }
}

export async function getPack(packId: string): Promise<RemotePackDetails> {
  const res = await apiFetch(`/api/library/packs/${encodeURIComponent(packId)}`);
  if (!res.ok) {
    throw new Error(`Failed to get pack (${res.status})`);
  }
  return (await res.json()) as RemotePackDetails;
}

export async function getPackContents(packId: string): Promise<RemotePackContentsResponse> {
  const res = await apiFetch(`/api/library/packs/${encodeURIComponent(packId)}/contents`);
  if (!res.ok) {
    throw new Error(`Failed to get pack contents (${res.status})`);
  }
  return (await res.json()) as RemotePackContentsResponse;
}

export async function getPackDownloadManifest(packId: string): Promise<RemotePackDownloadManifest> {
  const res = await apiFetch(`/api/library/packs/${encodeURIComponent(packId)}/download-manifest`);
  if (!res.ok) {
    throw new Error(`Failed to get pack manifest (${res.status})`);
  }
  return (await res.json()) as RemotePackDownloadManifest;
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
