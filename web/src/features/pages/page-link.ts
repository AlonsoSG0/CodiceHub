/** Copies a page's canonical URL. Clipboard access can be denied; the address bar still has the link. */
export async function copyPageLink(pageId: string): Promise<void> {
  const url = `${window.location.origin}/notes/${pageId}`;
  try {
    await navigator.clipboard?.writeText(url);
  } catch {
    // Nothing to recover from: the link stays reachable from the address bar.
  }
}
