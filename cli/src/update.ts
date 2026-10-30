import { chmod, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { UsageError } from "./command.js";
import { dataHome } from "./context.js";
import { isAlive, probeServer, readState } from "./server-state.js";

export type UpdateResult = { installed: boolean; version: string; path: string };
export type UpdateOptions = {
  execPath: string;
  currentVersion: string;
  baseUrl?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  home?: string;
  pinnedVersion?: string;
};

export class UpdateError extends Error {}

export function releaseAsset(platform: NodeJS.Platform, arch: string): string {
  const os = platform === "win32" ? "windows" : platform;
  if (os !== "linux" && os !== "darwin" && os !== "windows") throw new UpdateError(`unsupported operating system: ${platform}`);
  if (arch !== "x64" && arch !== "arm64") throw new UpdateError(`unsupported architecture: ${arch}`);
  return `chub-${os}-${arch}`;
}

function versionTuple(version: string): bigint[] | undefined {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return undefined;
  return version.split(".").map(BigInt);
}

export async function latestVersion(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/releases/latest`;
  try {
    const response = await fetchImpl(url, { redirect: "manual" });
    let location = response.headers.get("location");
    if (!location) location = (await fetchImpl(url)).url;
    const match = location.match(/\/tag\/v(\d+\.\d+\.\d+)(?:[/?#]|$)/);
    if (match?.[1]) return match[1];
  } catch {
    // The error below identifies the release that could not be resolved.
  }
  throw new UpdateError(`could not resolve latest release from ${url}`);
}

export function verifyChecksum(sums: string, asset: string, bytes: Uint8Array): void {
  const name = asset.endsWith(".gz") ? asset : `${asset}.gz`;
  const line = sums.split(/\r?\n/).map((entry) => entry.trim().split(/\s+/)).find((parts) => parts[1] === name);
  if (!line) throw new UpdateError(`no checksum published for ${name} in this release`);
  const expected = line[0] ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(expected)) throw new UpdateError(`invalid checksum for ${name}`);
  const actual = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (expected.toLowerCase() !== actual) throw new UpdateError(`checksum mismatch for ${name}: expected ${expected}, got ${actual}`);
}

async function download(url: string): Promise<Response> {
  try {
    const response = await fetch(url);
    if (response.ok) return response;
  } catch {
    // Report the requested URL for both transport and HTTP failures.
  }
  throw new UpdateError(`could not download ${url}`);
}

export async function updateBinary(options: UpdateOptions): Promise<UpdateResult> {
  const { execPath, currentVersion } = options;
  if (!["chub", "chub.exe"].includes(basename(execPath))) throw new UpdateError("executable must be named chub or chub.exe");
  const platform = options.platform ?? process.platform;
  const asset = releaseAsset(platform, options.arch ?? process.arch);
  const base = (options.baseUrl ?? process.env.CHUB_RELEASE_BASE_URL ?? "https://github.com/AlonsoSG0/CodiceHub").replace(/\/$/, "");
  const pinned = options.pinnedVersion?.replace(/^v/, "");
  if (options.pinnedVersion !== undefined && (!pinned || !versionTuple(pinned))) throw new UsageError("--version needs a release version X.Y.Z");
  const version = pinned ?? await latestVersion(base);
  if (!pinned) {
    const latest = versionTuple(version);
    const current = versionTuple(currentVersion);
    if (!latest || !current) throw new UpdateError(`cannot compare versions ${version} and ${currentVersion}`);
    const newer = latest.some((part, i) => part > current[i]! && latest.slice(0, i).every((v, j) => v === current[j]));
    if (!newer) return { installed: false, version: currentVersion, path: execPath };
  }
  if (platform === "win32") {
    const state = await readState(options.home ?? dataHome());
    if (state && isAlive(state.pid) && await probeServer(state.url) === state.pid) {
      throw new UpdateError(`chub is running at ${state.url}; Windows cannot replace a running executable, so run chub stop first`);
    }
  }
  const release = pinned ? `releases/download/v${pinned}` : "releases/latest/download";
  const assetUrl = `${base}/${release}/${asset}.gz`;
  const compressed = new Uint8Array(await (await download(assetUrl)).arrayBuffer());
  const sums = await (await download(`${base}/${release}/SHA256SUMS`)).text();
  verifyChecksum(sums, asset, compressed);
  let binary: Uint8Array;
  try { binary = Bun.gunzipSync(compressed); } catch { throw new UpdateError(`could not decompress ${asset}.gz`); }
  const stage = join(dirname(execPath), `.chub.${process.pid}`);
  let staged = false;
  try {
    await unlink(stage).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await writeFile(stage, binary, { flag: "wx" });
    staged = true;
    await chmod(stage, 0o755);
    let result: ReturnType<typeof Bun.spawnSync>;
    try {
      result = Bun.spawnSync([stage, "--version"], { stdout: "pipe", stderr: "ignore" });
    } catch (error) {
      throw new UpdateError(`could not run staged binary: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (result.exitCode !== 0) throw new UpdateError(`staged binary --version exited with code ${result.exitCode}`);
    const installedVersion = result.stdout?.toString().trim() ?? "";
    if (!installedVersion) throw new UpdateError("staged binary reported an empty version");
    if (installedVersion !== version) throw new UpdateError(`staged binary version ${installedVersion} does not match release ${version}`);
    await rename(stage, execPath);
    staged = false;
    return { installed: true, version: installedVersion, path: execPath };
  } catch (error) {
    throw new UpdateError(`could not install ${execPath}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (staged) await unlink(stage).catch(() => undefined);
  }
}
