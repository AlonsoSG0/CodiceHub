import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const menuPopupClassName =
  "min-w-44 rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md";

export const menuItemClassName =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground outline-none hover:bg-muted data-[highlighted]:bg-muted";

type MenuPopupProps = Omit<ComponentProps<typeof BaseMenu.Popup>, "className"> & {
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
};

export function MenuPopup({ align = "start", className, children, ...props }: MenuPopupProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner align={align} sideOffset={6} className="z-50">
        <BaseMenu.Popup className={cn(menuPopupClassName, className)} {...props}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}
