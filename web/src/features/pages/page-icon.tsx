import {
  Book,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Code2,
  Coffee,
  FileText,
  Flame,
  Folder,
  Globe,
  Heart,
  House,
  Image,
  Lightbulb,
  ListTodo,
  MessageSquare,
  Music,
  NotebookText,
  Palette,
  PenLine,
  Rocket,
  Settings,
  Star,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/i18n";

const ICONS: Record<string, LucideIcon> = {
  "notebook-text": NotebookText,
  book: Book,
  "book-open": BookOpen,
  "briefcase-business": BriefcaseBusiness,
  "calendar-days": CalendarDays,
  check: Check,
  code: Code2,
  coffee: Coffee,
  "file-text": FileText,
  flame: Flame,
  folder: Folder,
  globe: Globe,
  heart: Heart,
  house: House,
  image: Image,
  lightbulb: Lightbulb,
  "list-todo": ListTodo,
  "message-square": MessageSquare,
  music: Music,
  palette: Palette,
  "pen-line": PenLine,
  rocket: Rocket,
  settings: Settings,
  star: Star,
  users: Users,
  zap: Zap,
};

export const PAGE_ICON_NAMES = Object.keys(ICONS);
export const DEFAULT_PAGE_ICON = "notebook-text";

export function PageIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
  const { t } = useT();
  if (icon?.startsWith("emoji:") && icon.length > 6) {
    const emoji = icon.slice("emoji:".length);
    return <span className={className} role="img" aria-label={emoji}>{emoji}</span>;
  }

  // Object.hasOwn, not ICONS[icon]: a plain object literal answers for inherited keys too, so a
  // stored value like "constructor" would resolve to Object and React would try to render it.
  const name = icon && Object.hasOwn(ICONS, icon) ? icon : DEFAULT_PAGE_ICON;
  const Glyph = ICONS[name] ?? ICONS[DEFAULT_PAGE_ICON]!;
  return <Glyph className={className} size={18} aria-label={t(`notes.icon.${name}`)} aria-hidden={false} />;
}
