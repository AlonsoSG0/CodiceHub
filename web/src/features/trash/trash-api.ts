import { ApiError } from "@/lib/api";
import type { PageMeta } from "@/lib/api";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();

  if (!response.ok) {
    const code =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `http_${response.status}`;
    throw new ApiError(code, response.status);
  }

  return body as T;
}

export async function fetchTrash(): Promise<PageMeta[]> {
  const response = await requestJson<{ pages: PageMeta[] }>("/api/pages/trash");
  return response.pages;
}

export function restoreTrashPage(id: string): Promise<{ restored: string[] }> {
  return requestJson<{ restored: string[] }>(`/api/pages/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
}

export function purgeTrashPage(id: string): Promise<{ purged: string[] }> {
  return requestJson<{ purged: string[] }>(`/api/pages/${encodeURIComponent(id)}/purge`, {
    method: "DELETE",
  });
}
