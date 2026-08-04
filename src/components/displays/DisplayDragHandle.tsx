"use client";

type DisplayDragHandleProps = {
  label: string;
  disabled?: boolean;
  dragImplementation?: "dnd-kit" | "native";
  onDragStart: () => void;
  onDragEnd: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export function DisplayDragHandle({
  label,
  disabled = false,
  dragImplementation = "native",
  onDragStart,
  onDragEnd,
  onMoveUp,
  onMoveDown,
}: DisplayDragHandleProps) {
  const useNativeDrag = dragImplementation === "native";

  return (
    <button
      type="button"
      draggable={useNativeDrag ? !disabled : false}
      aria-label={`Reorder ${label}`}
      className="inline-flex h-14 w-7 shrink-0 cursor-grab flex-col items-center justify-center rounded-md border border-border text-xs leading-none text-muted hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
      onDragStart={
        useNativeDrag
          ? (event) => {
              event.stopPropagation();
              onDragStart();
            }
          : undefined
      }
      onDragEnd={
        useNativeDrag
          ? (event) => {
              event.stopPropagation();
              onDragEnd();
            }
          : undefined
      }
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          onMoveUp();
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          onMoveDown();
        }
      }}
    >
      <span aria-hidden="true" className="select-none tracking-[-0.2em]">
        ⋮
      </span>
      <span aria-hidden="true" className="-mt-1 select-none tracking-[-0.2em]">
        ⋮
      </span>
    </button>
  );
}
