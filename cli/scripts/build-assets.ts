import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const webRoot = join(root, "web/dist");
const migrationsRoot = join(root, "server/drizzle");
const source = join(root, "cli/src");

async function archiveDirectory(directory: string): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else entries[relative(directory, path)] = await readFile(path);
    }
  }
  await walk(directory);
  return entries;
}

const webEntries = await archiveDirectory(webRoot);
const webArchive = await new Bun.Archive(webEntries).bytes();
const drizzleArchive = await new Bun.Archive(await archiveDirectory(migrationsRoot)).bytes();
const webHash = createHash("sha256")
  .update(webArchive)
  .update(drizzleArchive)
  .digest("hex").slice(0, 16);
await mkdir(source, { recursive: true });
await writeFile(join(source, "web.tar"), webArchive);
await writeFile(join(source, "drizzle.tar"), drizzleArchive);
await writeFile(join(source, "asset-hash.ts"), `export const assetsHash = ${JSON.stringify(webHash)};\n`);
