export type ListboxPlacement = "up" | "down";

interface VerticalEdges {
  top: number;
  bottom: number;
}

export interface ResolvedListboxPlacement {
  placement: ListboxPlacement;
  maxHeight: number;
}

export function resolveListboxPlacement(
  trigger: VerticalEdges,
  boundary: VerticalEdges,
  menuHeight: number,
  gap = 6,
): ResolvedListboxPlacement {
  const above = Math.max(0, trigger.top - boundary.top - gap);
  const below = Math.max(0, boundary.bottom - trigger.bottom - gap);
  const placement: ListboxPlacement =
    menuHeight > below && above > below ? "up" : "down";

  return {
    placement,
    maxHeight: Math.floor(placement === "up" ? above : below),
  };
}
