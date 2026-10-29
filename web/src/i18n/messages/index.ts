import { books } from "./books";
import { editor } from "./editor";
import { goals } from "./goals";
import { habits } from "./habits";
import { home } from "./home";
import { notes } from "./notes";
import { projects } from "./projects";
import { routine } from "./routine";
import { search } from "./search";
import { settings } from "./settings";
import { shell } from "./shell";
import { tasks } from "./tasks";
import { trash } from "./trash";
import type { DomainMessages, Language } from "./types";

export type { DomainMessages, Language } from "./types";

/**
 * Every domain's catalogue, merged per language. One file per domain keeps two translators out of each other's way, and
 * merging here means a surface only has to know its own keys.
 */
const domains: readonly DomainMessages[] = [
  shell,
  notes,
  editor,
  home,
  search,
  trash,
  habits,
  books,
  projects,
  tasks,
  goals,
  routine,
  settings,
];

function merge(language: Language): Record<string, string> {
  return Object.assign({}, ...domains.map((domain) => domain[language]));
}

export const messages: Record<Language, Record<string, string>> = { en: merge("en"), es: merge("es") };
