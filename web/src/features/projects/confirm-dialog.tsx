import { type ReactNode } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogBody,
  DialogClose,
  DialogCloseIcon,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  children?: ReactNode;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
};

/**
 * The confirmation that stands in front of a deletion.
 *
 * Deleting a project takes its board and its tasks with it, so the question is asked out loud and the
 * answer has to be given twice: once to open this dialog, and once to confirm it.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  children,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup>
          <DialogHeader>
            <div className="flex flex-col gap-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
            <DialogCloseIcon aria-label={t("projects.cancelClose")} />
          </DialogHeader>

          {children === undefined ? null : <DialogBody>{children}</DialogBody>}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>{t("projects.cancel")}</DialogClose>
            <Button variant="destructive" onClick={() => void onConfirm()}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
