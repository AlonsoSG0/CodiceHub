/*
 * Workspace time zone.
 *
 * Every date this workspace derives — which day "today" is, and therefore which days are still editable — is calculated
 * in this zone, on the client and on the server alike. The device's zone is not consulted for that decision, because a
 * server in a container runs in UTC and would silently disagree with the person using it.
 *
 * Blocks are unaffected: they store local wall-clock `HH:MM`, and 07:00 means 07:00 in the workspace zone.
 */

import type { DayKey } from "@/features/habits/date";

export const DEFAULT_TIMEZONE = "America/Mexico_City";

/** Offered first in the picker, because these are the zones this workspace actually lives in. */
export const featuredTimezones: readonly string[] = [
  "America/Mexico_City",
  "America/Monterrey",
  "America/Guadalajara",
  "America/Cancun",
  "America/Merida",
  "America/Chihuahua",
  "America/Hermosillo",
  "America/Tijuana",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const fallbackTimezones: readonly string[] = ["UTC", ...featuredTimezones];

/** True for anything `Intl` accepts as a zone, which is the only validation that matters. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** The zone this machine would use, as a starting point when the workspace has never chosen one. */
export function detectTimeZone(): string {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isTimeZone(detected) ? detected : DEFAULT_TIMEZONE;
}

/** Today's local calendar day in the given zone, as a day key. Never derived from UTC. */
export function todayInZone(timeZone: string, now: Date = new Date()): DayKey {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: isTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** `GMT-6` and friends, so a zone reads unambiguously while the user is choosing it. */
export function zoneOffsetLabel(timeZone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "shortOffset" }).formatToParts(now);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** `Mexico City (GMT-6)`, built from the zone id so no translation table has to be maintained. */
export function zoneLabel(timeZone: string): string {
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  const offset = zoneOffsetLabel(timeZone);
  return offset === "" ? city : `${city} (${offset})`;
}

/** Every zone this runtime knows, which is the full tz database on any modern engine. */
export function allTimezones(): string[] {
  // SAFETY: `Intl.supportedValuesOf` exists on every engine this app targets, but it is missing from the bundled
  // typings, so it is read as an optional call and falls back to the curated list below when the runtime lacks it.
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const list = typeof supported === "function" ? supported("timeZone") : [];
  return list.length > 0 ? list : [...fallbackTimezones];
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** A zone matches when its id or its label contains the query, ignoring case and accents. */
export function zoneMatches(timeZone: string, query: string): boolean {
  const needle = normalize(query.trim());
  if (needle === "") return true;
  return normalize(timeZone).includes(needle) || normalize(zoneLabel(timeZone)).includes(needle);
}

export type ZoneGroup = { label: string; zones: string[] };

/**
 * The picker's list: the featured zones first, then everything else, each filtered by the query. A featured zone never
 * appears twice, and a group with nothing left after filtering is dropped.
 */
export function zoneGroups(query: string): ZoneGroup[] {
  const featured = featuredTimezones.filter((zone) => zoneMatches(zone, query));
  const rest = allTimezones()
    .filter((zone) => !featuredTimezones.includes(zone) && zoneMatches(zone, query))
    .sort((left, right) => left.localeCompare(right));

  return [
    { label: "Mexico and the US", zones: featured },
    { label: "Everywhere else", zones: rest },
  ].filter((group) => group.zones.length > 0);
}
