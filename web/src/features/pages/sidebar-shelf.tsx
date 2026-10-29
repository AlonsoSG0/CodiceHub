import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { ChevronDown, ChevronRight, ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { MenuPopup, menuItemClassName } from "@/components/ui/menu";
import { useT } from "@/i18n";

type SidebarShelfProps = {
  label: string;
  /** The default `Pages` shelf cannot be renamed or deleted. */
  editable?: boolean;
  collapsed: boolean;
  /** A page is being dragged somewhere in the sidebar, so this shelf can accept it. */
  canDrop?: boolean;
  /** Starts in rename mode, used right after the shelf is created. */
  autoRename?: boolean;
  onToggle: () => void;
  onCreate: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onDrop?: () => void;
  children?: ReactNode;
};

/**
 * One shelf of the sidebar: a quiet 22 px heading with a chevron, the name, and the two actions that matter
 * (new page, rename/delete). The heading is also the drop target that moves a page onto the shelf.
 */
export function SidebarShelf({
  label,
  editable = false,
  collapsed,
  canDrop = false,
  autoRename = false,
  onToggle,
  onCreate,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onDrop,
  children,
}: SidebarShelfProps) {
  const { t } = useT();
  const [renaming, setRenaming] = useState(autoRename);
  const [draft, setDraft] = useState(label);
  const [dropping, setDropping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoRenameUsed = useRef(false);

  useEffect(() => {
    // Only the shelf that was just created opens in rename mode, and only once.
    if (!autoRename || autoRenameUsed.current) return;
    autoRenameUsed.current = true;
    setRenaming(true);
    setDraft(label);
  }, [autoRename, label]);

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  const commit = () => {
    const name = draft.trim();
    setRenaming(false);
    if (name !== "" && name !== label) onRename?.(name);
    else setDraft(label);
  };

  const cancel = () => {
    setRenaming(false);
    setDraft(label);
  };

  return (
    <div className="sidebar-shelf">
      <div
        className="sidebar-group-heading sidebar-shelf-heading"
        data-drop={dropping ? "true" : undefined}
        onDragOver={(event) => {
          if (!canDrop || !onDrop) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          if (!canDrop || !onDrop) return;
          event.preventDefault();
          setDropping(false);
          onDrop();
        }}
      >
        <button
          type="button"
          className="sidebar-shelf-toggle"
          aria-label={`${collapsed ? t("notes.expand") : t("notes.collapse")} ${label}`} 
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
        </button>

        {renaming ? (
          <input
            ref={inputRef}
            aria-label={`${t("notes.rename")} ${label}`} 
            className="sidebar-shelf-input"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
          />
        ) : (
          <span className="sidebar-shelf-label">{label}</span>
        )}

        <div className="sidebar-shelf-actions">
          <button
            type="button"
            aria-label={t("notes.newPageInShelf", { label })}
            title={t("notes.newPage")}
            className="sidebar-group-action"
            onClick={onCreate}
          >
            <Plus size={12} aria-hidden="true" />
          </button>
          {editable ? (
            <BaseMenu.Root>
              <BaseMenu.Trigger
                render={
                  <button
                    type="button"
                    aria-label={t("notes.shelfActionsFor", { label })}
                    title={t("notes.shelfActions")}
                    className="sidebar-group-action"
                  />
                }
              >
                <span aria-hidden="true">⋯</span>
              </BaseMenu.Trigger>
              <MenuPopup align="end">
                <BaseMenu.Item
                  className={menuItemClassName}
                  onClick={() => {
                    setDraft(label);
                    setRenaming(true);
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                  {t("notes.rename")}
                </BaseMenu.Item>
                <BaseMenu.Item
                  className={menuItemClassName}
                  disabled={!canMoveUp}
                  onClick={() => onMoveUp?.()}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                  {t("notes.moveUp")}
                </BaseMenu.Item>
                <BaseMenu.Item
                  className={menuItemClassName}
                  disabled={!canMoveDown}
                  onClick={() => onMoveDown?.()}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                  {t("notes.moveDown")}
                </BaseMenu.Item>
                <BaseMenu.Item
                  className={menuItemClassName}
                  onClick={() => onDelete?.()}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {t("notes.deleteShelf")}
                </BaseMenu.Item>
              </MenuPopup>
            </BaseMenu.Root>
          ) : null}
        </div>
      </div>

      {collapsed ? null : children}
    </div>
  );
}
