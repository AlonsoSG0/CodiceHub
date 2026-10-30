/** The command that opens `url` in the user's browser. Each desktop has its own opener. */
export function browserCommand(url: string, platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "darwin") return ["open", url];
  if (platform === "win32") return ["cmd", "/c", "start", "", url];
  return ["xdg-open", url];
}

/** Best effort: a headless machine or a missing opener warns instead of taking the server down. */
export function openBrowser(url: string): void {
  try {
    Bun.spawn(browserCommand(url), { stdout: "ignore", stderr: "ignore" });
  } catch {
    console.error(`chub could not open ${url} in a browser`);
  }
}
