export const PLAYER_TABLE_LAYER_CLASSES = {
  frozenBodyCell: "z-[var(--table-sticky-column-z)]",
  headerCell: "sticky top-[var(--table-sticky-top)] z-[var(--table-header-z)]",
  cornerHeaderCell: "sticky top-[var(--table-sticky-top)] z-[var(--table-corner-z)]",
  toolbar: "z-[var(--table-toolbar-z)]",
  popover: "z-[var(--table-popover-z)]",
  modal: "z-[var(--app-modal-z)]"
} as const;

export const STICKY_TABLE_HEADER_CLASS = "sticky top-[var(--table-sticky-top)] z-[var(--table-header-z)] bg-slate-50";
