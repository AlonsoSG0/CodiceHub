import { ApiError } from "@/lib/api";
import type { PageMeta } from "@/lib/api";
import type { PageMoveBody } from "./tree.js";

export async function movePage(pageId: string, body: PageMoveBody): Promise<PageMeta[]> {
  const response = await fetch(`/api/pages/${encodeURIComponent(pageId)}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json();

  if (!response.ok) {
    const code =
      typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
        ? result.error
        : `http_${response.status}`;
    throw new ApiError(code, response.status);
  }

  if (typeof result !== "object" || result === null || !("pages" in result) || !Array.isArray(result.pages)) {
    throw new Error("invalid_move_response");
  }

  return result.pages as PageMeta[];
}
