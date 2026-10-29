// Vendored from Kibo UI: https://www.kibo-ui.com/components/mini-calendar
// Registry item: https://www.kibo-ui.com/r/mini-calendar.json — a single file, "index.tsx".
//
// Documented substitutions against the upstream source:
//
// 1. `@radix-ui/react-use-controllable-state` -> the repository's own port in
//    `web/src/components/kibo-ui/use-controllable-state.ts`. This project forbids Radix (see AGENTS.md),
//    and that port keeps Radix's controlled/uncontrolled semantics.
// 2. `date-fns` -> the four local helpers below. The project does not depend on date-fns: the habits
//    section keeps its own calendar helpers in `web/src/features/habits/date.ts` and formats through
//    `Intl.DateTimeFormat`, so the same four functions are reproduced here rather than adding a dependency.
// 3. `radix-ui`'s `Slot.Root` -> `cloneElement`. Radix's Slot merges the trigger's props into the caller's
//    own element and composes the event handlers; `cloneElement` is the same contract, and it leaves the
//    caller's element unstyled, which a Base UI `render` prop would not.
// 4. `useMiniCalendar` is exported. Upstream keeps the hook private, but a composition that draws its own
//    day chip needs the context's `onDateSelect`; `MiniCalendarDay` stays available for the callers that
//    want the upstream chip.
//
// Everything else is upstream, unchanged.

import {
  cloneElement,
  type ButtonHTMLAttributes,
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  type MouseEvent,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useControllableState } from "../use-controllable-state";

// Context for sharing state between components
type MiniCalendarContextType = {
  selectedDate: Date | null | undefined;
  onDateSelect: (date: Date) => void;
  startDate: Date;
  onNavigate: (direction: "prev" | "next") => void;
  days: number;
};

const MiniCalendarContext = createContext<MiniCalendarContextType | null>(null);

export const useMiniCalendar = () => {
  const context = useContext(MiniCalendarContext);

  if (!context) {
    throw new Error("MiniCalendar components must be used within MiniCalendar");
  }

  return context;
};

const monthFormat = new Intl.DateTimeFormat("en", { month: "short" });

/**
 * Local-noon arithmetic, the rule the habits section already follows: a daylight-saving transition can make
 * local midnight not exist at all, and the calendar must not slide onto a neighbouring day because of it.
 */
const addDays = (date: Date, amount: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12);

const isSameDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const isToday = (date: Date): boolean => isSameDay(date, new Date());

// Helper function to get array of consecutive dates
const getDays = (startDate: Date, count: number): Date[] => {
  const days: Date[] = [];
  for (let i = 0; i < count; i++) {
    days.push(addDays(startDate, i));
  }
  return days;
};

// Helper function to format date
const formatDate = (date: Date) => {
  const month = monthFormat.format(date);
  const day = String(date.getDate());

  return { month, day };
};

export type MiniCalendarProps = HTMLAttributes<HTMLDivElement> & {
  value?: Date;
  defaultValue?: Date;
  onValueChange?: (date: Date | undefined) => void;
  startDate?: Date;
  defaultStartDate?: Date;
  onStartDateChange?: (date: Date | undefined) => void;
  days?: number;
};

export const MiniCalendar = ({
  value,
  defaultValue,
  onValueChange,
  startDate,
  defaultStartDate = new Date(),
  onStartDateChange,
  days = 5,
  className,
  children,
  ...props
}: MiniCalendarProps) => {
  const [selectedDate, setSelectedDate] = useControllableState<Date | undefined>({
    prop: value,
    defaultProp: defaultValue,
    onChange: onValueChange,
  });

  const [currentStartDate, setCurrentStartDate] = useControllableState<Date | undefined>({
    prop: startDate,
    defaultProp: defaultStartDate,
    onChange: onStartDateChange,
  });

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const handleNavigate = (direction: "prev" | "next") => {
    const newStartDate = addDays(currentStartDate || new Date(), direction === "next" ? days : -days);
    setCurrentStartDate(newStartDate);
  };

  const contextValue: MiniCalendarContextType = {
    selectedDate: selectedDate || null,
    onDateSelect: handleDateSelect,
    startDate: currentStartDate || new Date(),
    onNavigate: handleNavigate,
    days,
  };

  return (
    <MiniCalendarContext.Provider value={contextValue}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-background p-2",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </MiniCalendarContext.Provider>
  );
};

export type MiniCalendarNavigationProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    direction: "prev" | "next";
    asChild?: boolean;
  };

export const MiniCalendarNavigation = ({
  direction,
  asChild = false,
  children,
  onClick,
  ...props
}: MiniCalendarNavigationProps) => {
  const { onNavigate } = useMiniCalendar();
  const Icon = direction === "prev" ? ChevronLeftIcon : ChevronRightIcon;

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    onNavigate(direction);
    onClick?.(event);
  };

  if (asChild) {
    // Radix's `Slot.Root` merges the trigger's props into the caller's own element and composes the event
    // handlers: the caller's handler runs first, then the slot's. `cloneElement` is the same contract.
    const child = children as ReactElement<{ onClick?: MouseEventHandler<HTMLButtonElement> }>;
    const childOnClick = child.props.onClick;
    return cloneElement(child, {
      ...props,
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        childOnClick?.(event);
        handleClick(event);
      },
    });
  }

  return (
    <Button
      onClick={handleClick}
      size="icon"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon className="size-4" />}
    </Button>
  );
};

export type MiniCalendarDaysProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children: (date: Date) => ReactNode;
};

export const MiniCalendarDays = ({
  className,
  children,
  ...props
}: MiniCalendarDaysProps) => {
  const { startDate, days: dayCount } = useMiniCalendar();
  const days = getDays(startDate, dayCount);

  return (
    <div className={cn("flex items-center gap-1", className)} {...props}>
      {days.map((date) => children(date))}
    </div>
  );
};

export type MiniCalendarDayProps = ComponentProps<typeof Button> & {
  date: Date;
};

export const MiniCalendarDay = ({
  date,
  className,
  ...props
}: MiniCalendarDayProps) => {
  const { selectedDate, onDateSelect } = useMiniCalendar();
  const { month, day } = formatDate(date);
  const isSelected = selectedDate && isSameDay(date, selectedDate);
  const isTodayDate = isToday(date);

  return (
    <Button
      className={cn(
        "h-auto min-w-[3rem] flex-col gap-0 p-2 text-xs",
        isTodayDate && !isSelected && "bg-accent",
        className
      )}
      onClick={() => onDateSelect(date)}
      size="sm"
      type="button"
      variant={isSelected ? "default" : "ghost"}
      {...props}
    >
      <span
        className={cn(
          "font-medium text-[10px] text-muted-foreground",
          isSelected && "text-primary-foreground/70"
        )}
      >
        {month}
      </span>
      <span className="font-semibold text-sm">{day}</span>
    </Button>
  );
};
