export type PageMeta = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  position: number;
  updatedAt: string;
  deletedAt: string | null;
  favorite: boolean;
  /** The sidebar shelf that owns the page. `null` is the default `Pages` shelf. */
  sectionId: string | null;
};

/** A shelf the user created in the sidebar. The default `Pages` shelf has no row here. */
export type PageSection = {
  id: string;
  name: string;
  position: number;
};

export type Page = PageMeta & { content: unknown };

/** A page that mentions this one, with the sentence that carries the mention. */
export type PageBacklink = {
  id: string;
  title: string;
  icon: string | null;
  context: string;
};

export type CreatePageInput = {
  parentId?: string | null;
  sectionId?: string | null;
  title?: string;
  position?: number;
};

export type Backup = { name: string; bytes: number; createdAt: string };

export async function fetchBackups(): Promise<Backup[]> {
  return (await requestJson<{ backups: Backup[] }>("/api/backups")).backups;
}

export function createBackup(): Promise<{ name: string }> {
  return requestJson("/api/backups", { method: "POST" });
}

export function restoreBackup(name: string): Promise<{ restored: string }> {
  return requestJson(`/api/backups/${encodeURIComponent(name)}/restore`, { method: "POST" });
}

export async function fetchPreferences(): Promise<Record<string, unknown>> {
  const response = await requestJson<{ preferences?: Record<string, unknown> }>("/api/preferences");
  return response.preferences && typeof response.preferences === "object" ? response.preferences : {};
}

export function savePreference(key: string, value: unknown): Promise<unknown> {
  return requestJson<unknown>(`/api/preferences/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

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

export async function fetchTree(): Promise<PageMeta[]> {
  const response = await requestJson<{ pages: PageMeta[] }>("/api/pages/tree");
  return response.pages;
}

export function fetchPage(id: string): Promise<Page> {
  return requestJson<Page>(`/api/pages/${encodeURIComponent(id)}`);
}

export function createPage(input: CreatePageInput): Promise<Page> {
  return requestJson<Page>("/api/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function softDeletePage(id: string): Promise<{ deleted: string[] }> {
  return requestJson<{ deleted: string[] }>(`/api/pages/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * Puts a page on the favourites shelf. The server deliberately leaves `updatedAt` alone, so a favourite keeps
 * its place in recency order.
 */
export function setPageFavorite(id: string, favorite: boolean): Promise<Page> {
  return requestJson<Page>(`/api/pages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite }),
  });
}

/** Every page whose document mentions this one, with a one-line context each. */
export async function fetchBacklinks(id: string): Promise<PageBacklink[]> {
  const response = await requestJson<{ backlinks?: unknown }>(`/api/pages/${encodeURIComponent(id)}/backlinks`);
  return Array.isArray(response.backlinks) ? (response.backlinks as PageBacklink[]) : [];
}

/** Copies the page and its whole subtree as the next sibling; the server names it "<title> (copy)". */
export function duplicatePage(id: string): Promise<Page> {
  return requestJson<Page>(`/api/pages/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
}

export async function fetchSections(): Promise<PageSection[]> {
  const response = await requestJson<{ sections: PageSection[] }>("/api/sections");
  return Array.isArray(response.sections) ? response.sections : [];
}

export function createSection(name: string): Promise<PageSection> {
  return requestJson<PageSection>("/api/sections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function renameSection(id: string, name: string): Promise<PageSection> {
  return requestJson<PageSection>(`/api/sections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

/** Moves a shelf to `position` among the shelves; the answer is the rows whose position changed. */
export async function moveSection(id: string, position: number): Promise<PageSection[]> {
  const response = await requestJson<{ sections: PageSection[] }>(
    `/api/sections/${encodeURIComponent(id)}/move`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position }),
    },
  );
  return Array.isArray(response.sections) ? response.sections : [];
}

export function deleteSection(id: string): Promise<{ deleted: string }> {
  return requestJson<{ deleted: string }>(`/api/sections/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * Uploads an image and returns the path it was served from. The server sniffs the format and refuses anything
 * that is not a PNG, JPEG, GIF or WebP, so a caller never has to check the file itself.
 */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/uploads", { method: "POST", body: form });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const code =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `http_${response.status}`;
    throw new ApiError(code, response.status);
  }
  if (typeof body !== "object" || body === null || !("url" in body) || typeof body.url !== "string") {
    throw new ApiError("invalid_upload_response", 500);
  }
  return body.url;
}
