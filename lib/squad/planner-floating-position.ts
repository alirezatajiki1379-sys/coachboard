export type FloatingRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export type FloatingPosition = {
  left: number;
  top: number;
  maxHeight: number;
  placement: "top" | "bottom";
};

export function calculateAnchoredFloatingPosition({
  anchor,
  floatingWidth,
  floatingHeight,
  viewportWidth,
  viewportHeight,
  preferredPlacement = "bottom",
  gap = 8,
  viewportPadding = 12
}: {
  anchor: FloatingRect;
  floatingWidth: number;
  floatingHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  preferredPlacement?: "top" | "bottom";
  gap?: number;
  viewportPadding?: number;
}): FloatingPosition {
  const availableAbove = Math.max(0, anchor.top - viewportPadding - gap);
  const availableBelow = Math.max(0, viewportHeight - anchor.bottom - viewportPadding - gap);
  const preferredSpace = preferredPlacement === "bottom" ? availableBelow : availableAbove;
  const alternateSpace = preferredPlacement === "bottom" ? availableAbove : availableBelow;
  const placement = preferredSpace >= Math.min(floatingHeight, 240) || preferredSpace >= alternateSpace
    ? preferredPlacement
    : preferredPlacement === "bottom" ? "top" : "bottom";
  const availableHeight = placement === "bottom" ? availableBelow : availableAbove;
  const maxHeight = Math.max(120, availableHeight);
  const renderedHeight = Math.min(floatingHeight, maxHeight);
  const unclampedTop = placement === "bottom"
    ? anchor.bottom + gap
    : anchor.top - gap - renderedHeight;
  const maxLeft = Math.max(viewportPadding, viewportWidth - floatingWidth - viewportPadding);

  return {
    left: Math.min(Math.max(viewportPadding, anchor.left + (anchor.width - floatingWidth) / 2), maxLeft),
    top: Math.min(Math.max(viewportPadding, unclampedTop), Math.max(viewportPadding, viewportHeight - renderedHeight - viewportPadding)),
    maxHeight,
    placement
  };
}
