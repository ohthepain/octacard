import { apiFetch } from "@/lib/api-client";

export interface AdminTaxonomyType {
  id: string;
  key: string;
}

export interface AdminTaxonomyFamily {
  id: string;
  key: string;
  types: AdminTaxonomyType[];
}

export interface AdminTaxonomyState {
  families: AdminTaxonomyFamily[];
}

async function parseError(res: Response, fallback: string): Promise<Error> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) return new Error(data.error);
  } catch {
    // Ignore JSON parse failures and fall through to default message.
  }
  return new Error(fallback);
}

export async function getAdminTaxonomy(): Promise<AdminTaxonomyState> {
  const res = await apiFetch("/api/admin/taxonomy");
  if (!res.ok) throw await parseError(res, `Failed to load taxonomy (${res.status})`);
  return (await res.json()) as AdminTaxonomyState;
}

export async function addInstrumentFamily(key: string): Promise<AdminTaxonomyState> {
  const res = await apiFetch("/api/admin/taxonomy/families", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw await parseError(res, `Failed to add family (${res.status})`);
  return (await res.json()) as AdminTaxonomyState;
}

export async function removeInstrumentFamily(familyId: string): Promise<AdminTaxonomyState> {
  const res = await apiFetch(`/api/admin/taxonomy/families/${encodeURIComponent(familyId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw await parseError(res, `Failed to remove family (${res.status})`);
  return (await res.json()) as AdminTaxonomyState;
}

export async function addInstrumentType(familyId: string, key: string): Promise<AdminTaxonomyState> {
  const res = await apiFetch(`/api/admin/taxonomy/families/${encodeURIComponent(familyId)}/types`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw await parseError(res, `Failed to add type (${res.status})`);
  return (await res.json()) as AdminTaxonomyState;
}

export async function removeInstrumentType(familyId: string, typeId: string): Promise<AdminTaxonomyState> {
  const res = await apiFetch(
    `/api/admin/taxonomy/families/${encodeURIComponent(familyId)}/types/${encodeURIComponent(typeId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw await parseError(res, `Failed to remove type (${res.status})`);
  return (await res.json()) as AdminTaxonomyState;
}

export async function reorderInstrumentFamilies(familyIds: string[]): Promise<AdminTaxonomyState> {
  const res = await apiFetch("/api/admin/taxonomy/families/reorder", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ familyIds }),
  });
  if (!res.ok) throw await parseError(res, `Failed to reorder families (${res.status})`);
  return (await res.json()) as AdminTaxonomyState;
}

export async function reorderInstrumentTypes(familyId: string, typeIds: string[]): Promise<AdminTaxonomyState> {
  const res = await apiFetch(`/api/admin/taxonomy/families/${encodeURIComponent(familyId)}/types/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ typeIds }),
  });
  if (!res.ok) throw await parseError(res, `Failed to reorder types (${res.status})`);
  return (await res.json()) as AdminTaxonomyState;
}
