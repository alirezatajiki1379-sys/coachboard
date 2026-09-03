export const PLAYER_TABLE_LAYER_CLASSES = {
  frozenBodyCell: "z-[10]",
  headerCell: "sticky top-[var(--table-sticky-top)] z-[20]",
  cornerHeaderCell: "sticky top-[var(--table-sticky-top)] z-[30]",
  toolbar: "z-[40]",
  popover: "z-[60]",
  modal: "z-[100]"
} as const;

export const STICKY_TABLE_HEADER_CLASS = "sticky top-[var(--table-sticky-top)] z-[20] bg-slate-50";
