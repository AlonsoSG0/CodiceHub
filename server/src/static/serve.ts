import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

type FileError = NodeJS.ErrnoException;

function isMissingFile(error: unknown): error is FileError {
  return error instanceof Error && "code" in error && ["ENOENT", "ENOTDIR", "EISDIR"].includes(String(error.code));
}

function responseFor(path: string, contents: Buffer): Response {
  const contentType = contentTypes[extname(path).toLowerCase()] ?? "application/octet-stream";
  return new Response(new Uint8Array(contents), { status: 200, headers: { "Content-Type": contentType } });
}

export async function serveWebAsset(requestPath: string): Promise<Response | null> {
  const configuredDirectory = process.env.CHUB_WEB_DIR?.trim();
  const webDirectory = resolve(configuredDirectory || "web/dist");

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const assetPath = resolve(webDirectory, `.${decodedPath}`);
  const assetRelativePath = relative(webDirectory, assetPath);
  if (isAbsolute(assetRelativePath) || assetRelativePath === ".." || assetRelativePath.startsWith(`..${sep}`)) {
    return null;
  }

  try {
    return responseFor(assetPath, await readFile(assetPath));
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  const indexPath = resolve(webDirectory, "index.html");
  try {
    return responseFor(indexPath, await readFile(indexPath));
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    return null;
  }
}
