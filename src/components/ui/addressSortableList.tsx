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
import type { Address } from "../../storage/addressStore";
import type { Coin } from "../../storage/coinStore";
import type { Contact } from "../../storage/contactStore";
import type { Contract } from "../../storage/contractStore";
import { sortAddresses, AddressSortMode } from "../../lib/addressSorting";
import { extractAbi, getFunctions } from "../../lib/abiTypes";

type AddressSortableListProps = {
  items: Address[];
  sortMode: AddressSortMode;
  onReorder: (items: Address[]) => void;
  onHide: (id: string) => void;
  coins: Coin[];
  contacts: Contact[];
  contracts: Contract[];
  onSendCoins: (item: Address, coinId: string) => void;
  onApproveCoins: (item: Address, coinId: string) => void;
  onUseContract: (item: Address, functionName: string) => void;
};

export function AddressSortableList({
  items,
  sortMode,
  onReorder,
  onHide,
  coins,
  contacts,
  contracts,
  onSendCoins,
  onApproveCoins,
  onUseContract,
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
              coins={coins}
              contacts={contacts}
              onSendCoins={onSendCoins}
              onApproveCoins={onApproveCoins}
              onUseContract={onUseContract}
              contracts={contracts}
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
  coins: Coin[];
  contacts: Contact[];
  contracts: Contract[];
  onSendCoins: (item: Address, coinId: string) => void;
  onApproveCoins: (item: Address, coinId: string) => void;
  onUseContract: (item: Address, functionName: string) => void;
};

function SortableAddressCard({
  item,
  draggable,
  onHide,
  coins,
  contacts,
  contracts,
  onSendCoins,
  onApproveCoins,
  onUseContract,
}: SortableAddressCardProps) {
  const [selectedCoinId, setSelectedCoinId] = React.useState("");
  const [selectedFnName, setSelectedFnName] = React.useState("");

  const entryId = item.id.replace(/^address:/, '');

  const contactId = entryId;
  const contact = item.isContact ? contacts.find(c => c.id === contactId) : undefined;
  const contactChainIds = new Set(contact?.wallets?.map(w => w.chainId) ?? []);
  const filteredCoins = item.isContact
    ? coins.filter(c => contactChainIds.has(c.chainId))
    : [];

  const contract = !item.isContact ? contracts.find(c => c.id === entryId) : undefined;
  const contractAbi = contract ? extractAbi(contract.metadata) : null;
  const contractFunctions = getFunctions(contractAbi);
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
    <div ref={setNodeRef} style={style} className="w-full">
      <div className="w-full rounded-lg border border-border bg-card px-4 py-3">
        <div className="grid gap-3 sm:gap-x-6 sm:gap-y-2 sm:grid-cols-[minmax(0,1fr)_110px] sm:items-start">
          {/* Col 1: Name + address + tags */}
          <div className="min-w-0">
            <div className="font-medium">{item.name}</div>

            {item.group && item.group.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                {item.group.map((tag) => (
                  <span key={tag} className="rounded-full border border-border px-2 py-0.5">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Col 2: Actions */}
          <div className="flex items-center justify-end gap-2">
            {/* Contact: chain-filtered coin selector + Send button */}
            {item.isContact && (
              <>
                <select
                  className="h-7 rounded border border-border bg-background px-1 text-xs text-foreground"
                  value={selectedCoinId}
                  onChange={e => setSelectedCoinId(e.target.value)}
                >
                  <option value="">Coin…</option>
                  {filteredCoins.map(c => (
                    <option key={c.id} value={c.id}>{c.symbol}</option>
                  ))}
                </select>
                <button
                  disabled={!selectedCoinId}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
                  onClick={() => onSendCoins(item, selectedCoinId)}
                >
                  Send
                </button>
                <button
                  disabled={!selectedCoinId}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
                  onClick={() => onApproveCoins(item, selectedCoinId)}
                >
                  Approve
                </button>
              </>
            )}

            {/* Contract: function selector + Use button */}
            {!item.isContact && (
              <>
                <select
                  className="h-7 w-28 rounded border border-border bg-background px-1 text-xs text-foreground"
                  value={selectedFnName}
                  onChange={e => setSelectedFnName(e.target.value)}
                >
                  <option value="">Function…</option>
                  {contractFunctions.map(fn => (
                    <option
                      key={`${fn.name}(${fn.inputs.map(i => i.type).join(",")})`}
                      value={fn.name}
                    >
                      {fn.name}({fn.inputs.map(i => i.type).join(",")})
                    </option>
                  ))}
                </select>
                <button
                  disabled={!selectedFnName}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
                  onClick={() => onUseContract(item, selectedFnName)}
                >
                  Use
                </button>
              </>
            )}

            {/* Drag handle – only active in custom mode */}
            <button
              type="button"
              {...(draggable ? { ...attributes, ...listeners } : {})}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              disabled={!draggable}
            >
              ☰
            </button>

            {/* Hide button */}
            <button
              onClick={() => onHide(item.id)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-primary hover:text-primary-foreground"
            >
              Hide
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
