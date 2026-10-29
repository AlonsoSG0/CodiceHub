import { DragDropProvider } from "@dnd-kit/react";
import { useState, type ReactNode } from "react";

export interface SortableListProps<TItem> {
  items: TItem[];
  getItemId: (item: TItem) => string;
  renderItem: (item: TItem) => ReactNode;
  label?: string;
  onItemsChange?: (items: TItem[]) => void;
}

export function SortableList<TItem>({
  items: initialItems,
  getItemId,
  renderItem,
  label = "Sortable list",
  onItemsChange,
}: SortableListProps<TItem>) {
  const [items, setItems] = useState(initialItems);

  function moveItem(index: number, offset: -1 | 1) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const nextItems = [...items];
    [nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]];
    setItems(nextItems);
    onItemsChange?.(nextItems);
  }

  return (
    <DragDropProvider>
      <ol aria-label={label}>
        {items.map((item, index) => {
          const id = getItemId(item);
          return (
            <li key={id} data-sortable-id={id}>
              {renderItem(item)}
              <button type="button" aria-label={`Move ${id} up`} disabled={index === 0} onClick={() => moveItem(index, -1)}>
                Move up
              </button>
              <button type="button" aria-label={`Move ${id} down`} disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}>
                Move down
              </button>
            </li>
          );
        })}
      </ol>
    </DragDropProvider>
  );
}
