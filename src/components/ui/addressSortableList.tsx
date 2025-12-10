import React, { useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

import type { Address } from "../../storage/addressStore";
import { sortAddresses, AddressSortMode } from "../../lib/addressSorting";

type AddressSortableListProps = {
  items: Address[];
  sortMode: AddressSortMode;
  onReorder: (items: Address[]) => void;
  onHide: (id: string) => void;
};

export function AddressSortableList({
  items,
  sortMode,
  onReorder,
  onHide,        
}: AddressSortableListProps) {
  // Only show visible items, then sort them
  const sortedItems = useMemo(() => {
    const visible = items.filter((a) => a.isVisible !== false);
    return sortAddresses(visible, sortMode);
  }, [items, sortMode]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    // Only allow reordering when mode === "custom"
    if (sortMode !== "custom") return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedItems.findIndex((i) => i.id === active.id);
    const newIndex = sortedItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortedItems, oldIndex, newIndex).map(
      (item, idx) => ({
        ...item,
        indexOrder: idx, 
      })
    );

    onReorder(reordered);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortedItems.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {sortedItems.map((addr) => (
            <SortableAddressCard
              key={addr.id}
              item={addr}
              draggable={sortMode === "custom"}
              onHide={onHide}       
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

type SortableAddressCardProps = {
  item: Address;
  draggable: boolean;
  onHide: (id: string) => void;
};

function SortableAddressCard({
  item,
  draggable,
  onHide, 
}: SortableAddressCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    cursor: draggable ? "grab" : "default",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-2">
          <CardTitle className="text-sm font-semibold">{item.name}</CardTitle>

          <div className="flex items-center gap-2">
            {/* Drag handle – only active in custom mode */}
            <button
              type="button"
              {...(draggable ? { ...attributes, ...listeners } : {})}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
              disabled={!draggable}
            >
              ☰
            </button>

            {/* Hide button */}
            <button
              onClick={() => onHide(item.id)}
              className="text-xs text-red-500 hover:text-red-700 ml-2 border px-2 py-0.5 rounded"
            >
              Hide
            </button>
          </div>
        </CardHeader>

        <CardContent className="text-xs py-2 space-y-1">
          <div className="text-gray-500 break-all">{item.id}</div>

          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span>{item.isContact ? "Contact" : "Contract"}</span>
            <span>·</span>
            <span>Name: {item.name}</span>
          </div>

          {item.group && item.group.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.group.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border px-2 py-0.5 text-[10px] leading-none"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
