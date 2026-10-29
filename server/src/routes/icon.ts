/*
 * The icon value contract for every surface that stores one. Pages and habits share it, so a value accepted
 * for a page icon is accepted for a habit icon and nothing else is.
 */

/** A null icon clears it; otherwise a `lucide-react` name in kebab case, or an `emoji:` payload. */
export function isValidIcon(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;

  const icon = value.trim();
  if (icon.startsWith("emoji:")) {
    const emoji = icon.slice("emoji:".length);
    return emoji.length >= 1 && emoji.length <= 8 && !/[\s\p{Cc}\p{Bidi_Control}]/u.test(emoji);
  }

  return icon.length <= 40 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(icon);
}
