import { apiFetch } from "@/lib/api-client";

export interface ProjectLocalPack {
  id: string;
  name: string;
  coverImageS3Key: string | null;
  coverImageUrl: string | null;
  rootPath: string | null;
  createdAt: number;
  updatedAt: number;
}

export function getProjectLocalPackCoverDisplayUrl(
  projectId: string,
  pack: Pick<ProjectLocalPack, "id" | "coverImageS3Key" | "coverImageUrl">,
): string | null {
  if (pack.coverImageS3Key && projectId) {
    return `/api/projects/${encodeURIComponent(projectId)}/packs/${encodeURIComponent(pack.id)}/cover?v=${encodeURIComponent(pack.coverImageS3Key)}`;
  }
  if (pack.coverImageUrl) return pack.coverImageUrl;
  return null;
}

export interface UpdateProjectPackBody {
  name?: string;
  coverImageS3Key?: string | null;
  coverImageUrl?: string | null;
}

export interface ProjectPackFolder {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
}

export interface ProjectPackEntry {
  id: string;
  folderId: string | null;
  displayName: string;
  sourceRef: string;
  regionStart: number;
  regionEnd: number;
  sortOrder: number;
}

export interface PackStructure {
  folders: ProjectPackFolder[];
  entries: ProjectPackEntry[];
}

interface ListProjectPacksResponse {
  packs: Array<
    Omit<ProjectLocalPack, "coverImageS3Key" | "coverImageUrl"> & {
      coverImageS3Key?: string | null;
      coverImageUrl?: string | null;
    }
  >;
}

export async function listProjectPacks(
  projectId: string,
): Promise<ProjectLocalPack[]> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/packs`,
  );
  if (res.status === 204 || res.status === 404 || res.status === 401) return [];
  if (!res.ok) {
    throw new Error(`Failed to list project packs (${res.status})`);
  }
  const text = await res.text();
  if (!text || text.trim() === "") return [];
  const data = JSON.parse(text) as ListProjectPacksResponse;
  return data.packs.map((p) => ({
    ...p,
    coverImageS3Key: p.coverImageS3Key ?? null,
    coverImageUrl: p.coverImageUrl ?? null,
  }));
}

export async function createProjectPack(
  projectId: string,
  name: string,
): Promise<ProjectLocalPack> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/packs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to create project pack (${res.status})`);
  }
  return (await res.json()) as ProjectLocalPack;
}

export async function updateProjectPack(
  projectId: string,
  packId: string,
  body: UpdateProjectPackBody,
): Promise<ProjectLocalPack> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/packs/${encodeURIComponent(packId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to update project pack (${res.status})`);
  }
  return (await res.json()) as ProjectLocalPack;
}

export async function getProjectPackCoverUploadUrl(
  projectId: string,
  packId: string,
  contentType: string,
): Promise<{ key: string; uploadUrl: string; expiresIn: number }> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/packs/${encodeURIComponent(packId)}/cover-upload-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to get pack cover upload URL (${res.status})`);
  }
  return res.json() as Promise<{
    key: string;
    uploadUrl: string;
    expiresIn: number;
  }>;
}

export async function deleteProjectPack(
  projectId: string,
  packId: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/packs/${encodeURIComponent(packId)}`,
    {
      method: "DELETE",
    },
  );
  if (res.status === 204) return;
  if (!res.ok) {
    throw new Error(`Failed to delete project pack (${res.status})`);
  }
}

export async function getPackStructure(
  projectId: string,
  packId: string,
): Promise<PackStructure> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/packs/${encodeURIComponent(packId)}/structure`,
  );
  if (!res.ok) {
    throw new Error(`Failed to get pack structure (${res.status})`);
  }
  return res.json() as Promise<PackStructure>;
}

export async function putPackStructure(
  projectId: string,
  packId: string,
  structure: PackStructure,
): Promise<void> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/packs/${encodeURIComponent(packId)}/structure`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(structure),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to save pack structure (${res.status})`);
  }
}

export interface PublishPackResult {
  packId: string;
  packName: string;
  entryCount: number;
  message: string;
}

export async function publishProjectPack(
  projectId: string,
  packId: string,
  options?: { packName?: string },
): Promise<PublishPackResult> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/packs/${encodeURIComponent(packId)}/publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options ?? {}),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to publish pack (${res.status})`);
  }
  return res.json() as Promise<PublishPackResult>;
}
