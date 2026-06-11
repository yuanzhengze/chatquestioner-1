import type { ArtifactCard, ArtifactDetail, SessionDetail, SessionSummary } from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const adminApi = {
  listSessions: (limit = 100) => get<SessionSummary[]>(`/api/admin/sessions?limit=${limit}`),
  sessionDetail: (id: string) => get<SessionDetail>(`/api/admin/session/${id}`),
  listArtifacts: (limit = 100) => get<ArtifactCard[]>(`/api/artifacts?limit=${limit}`),
  artifactDetail: (id: string) => get<ArtifactDetail>(`/api/artifact/${id}`),
};
