import {
  BookOpen,
  Circle,
  Droplets,
  Dumbbell,
  Footprints,
  Heart,
  Moon,
  Pencil,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps } from "react";

/**
 * Habit icons live under the same stored contract as page icons: `/api` accepts a kebab-case `lucide-react` name, so
 * these values are what the request carries and what the database keeps. A React component name here (`"Circle"`,
 * `"BookOpen"`) is rejected with `invalid_icon`, which is why the values are lowercase and hyphenated.
 */
export const DEFAULT_HABIT_ICON = "circle";

export const habitIconOptions: Array<{ value: string; label: string }> = [
  { value: DEFAULT_HABIT_ICON, label: "habits.defaultIcon" },
  { value: "book-open", label: "habits.iconBook" },
  { value: "dumbbell", label: "habits.iconStrength" },
  { value: "heart", label: "habits.iconHealth" },
  { value: "droplets", label: "habits.iconWater" },
  { value: "footprints", label: "habits.iconWalk" },
  { value: "moon", label: "habits.iconSleep" },
  { value: "pencil", label: "habits.iconWriting" },
  { value: "sparkles", label: "habits.iconPersonal" },
];

const icons: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  circle: Circle,
  droplets: Droplets,
  dumbbell: Dumbbell,
  footprints: Footprints,
  heart: Heart,
  moon: Moon,
  pencil: Pencil,
  sparkles: Sparkles,
};

export function HabitIcon({ name, ...props }: Omit<ComponentProps<LucideIcon>, "name"> & { name: string | null }) {
  // Object.hasOwn, not icons[name]: a plain object literal answers for inherited keys too, so a stored value like
  // "constructor" would resolve to Object and React would try to render it.
  const Icon = name !== null && Object.hasOwn(icons, name) ? icons[name] ?? Circle : Circle;
  return <Icon aria-hidden="true" {...props} />;
}
