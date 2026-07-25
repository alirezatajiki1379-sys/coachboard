export type PositionFamily = "goalkeeper" | "defensive" | "midfield" | "attacking" | "unassigned";

export type PositionFamilyMeta = {
  label: string;
  shortLabel: string;
  sectionLabel: string;
  chipClassName: string;
  badgeClassName: string;
};

export const positionFamilyOrder: PositionFamily[] = ["goalkeeper", "defensive", "midfield", "attacking", "unassigned"];

export const positionFamilyMeta: Record<PositionFamily, PositionFamilyMeta> = {
  goalkeeper: {
    label: "Goalkeeper",
    shortLabel: "GK",
    sectionLabel: "Goalkeepers",
    chipClassName: "border-emerald-200 bg-emerald-50",
    badgeClassName: "bg-emerald-700 text-white"
  },
  defensive: {
    label: "Defensive",
    shortLabel: "DEF",
    sectionLabel: "Defensive",
    chipClassName: "border-sky-200 bg-sky-50",
    badgeClassName: "bg-sky-700 text-white"
  },
  midfield: {
    label: "Midfield",
    shortLabel: "MID",
    sectionLabel: "Midfield",
    chipClassName: "border-amber-200 bg-amber-50",
    badgeClassName: "bg-amber-600 text-white"
  },
  attacking: {
    label: "Attacking",
    shortLabel: "ATT",
    sectionLabel: "Attacking",
    chipClassName: "border-rose-200 bg-rose-50",
    badgeClassName: "bg-rose-700 text-white"
  },
  unassigned: {
    label: "Unassigned position",
    shortLabel: "POS",
    sectionLabel: "Unassigned position",
    chipClassName: "border-slate-200 bg-slate-50",
    badgeClassName: "bg-slate-600 text-white"
  }
};

const defensivePositions = new Set([
  "CB",
  "RCB",
  "LCB",
  "IV",
  "RIV",
  "LIV",
  "RB",
  "RV",
  "LB",
  "LV",
  "FB",
  "WB",
  "RWB",
  "LWB",
  "DEF",
  "DEFENDER",
  "CENTRE BACK",
  "CENTER BACK",
  "FULL BACK",
  "FULLBACK",
  "WING BACK",
  "VERTEIDIGER",
  "INNENVERTEIDIGER",
  "AUSSENVERTEIDIGER"
]);

const midfieldPositions = new Set([
  "DM",
  "CDM",
  "ZDM",
  "CM",
  "ZM",
  "AM",
  "CAM",
  "ZOM",
  "LM",
  "RM",
  "MID",
  "MIDFIELDER",
  "CENTRAL MIDFIELD",
  "DEFENSIVE MIDFIELD",
  "ATTACKING MIDFIELD",
  "MITTELFELD",
  "SECHSER",
  "ACHTER",
  "ZEHNER"
]);

const attackingPositions = new Set([
  "RW",
  "RF",
  "LW",
  "LF",
  "ST",
  "CF",
  "SS",
  "FW",
  "ATT",
  "WINGER",
  "FORWARD",
  "STRIKER",
  "SECOND STRIKER",
  "ANGRIFF",
  "STUERMER",
  "STÜRMER",
  "FLUEGEL",
  "FLÜGEL"
]);

const goalkeeperPositions = new Set(["GK", "TW", "KEEPER", "GOALKEEPER", "TORWART"]);

export function normalizePosition(value?: string) {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  return positionAliases[normalized] ?? normalized;
}

export function getPositionFamily(position?: string): PositionFamily {
  const normalized = normalizePosition(position);
  if (!normalized) return "unassigned";
  if (goalkeeperPositions.has(normalized)) return "goalkeeper";
  if (defensivePositions.has(normalized)) return "defensive";
  if (midfieldPositions.has(normalized)) return "midfield";
  if (attackingPositions.has(normalized)) return "attacking";
  return "unassigned";
}

export function isGoalkeeperPosition(position?: string) {
  return getPositionFamily(position) === "goalkeeper";
}

export function formatPositionAbbreviation(position?: string) {
  const normalized = normalizePosition(position);
  return normalized || "POS";
}

const positionAliases: Record<string, string> = {
  TORWART: "GK",
  TW: "GK",
  GOALKEEPER: "GK",
  KEEPER: "GK",
  INNENVERTEIDIGER: "CB",
  INNENVERTEIDIGUNG: "CB",
  "CENTRE BACK": "CB",
  "CENTER BACK": "CB",
  IV: "CB",
  RIV: "CB",
  LIV: "CB",
  RV: "RB",
  "RIGHT BACK": "RB",
  "RECHTER VERTEIDIGER": "RB",
  LV: "LB",
  "LEFT BACK": "LB",
  "LINKER VERTEIDIGER": "LB",
  ZDM: "CDM",
  DM: "CDM",
  "DEFENSIVE MIDFIELDER": "CDM",
  "DEFENSIVE MIDFIELD": "CDM",
  "DEFENSIVES MITTELFELD": "CDM",
  ZM: "CM",
  "CENTRAL MIDFIELDER": "CM",
  "CENTRAL MIDFIELD": "CM",
  "ZENTRALES MITTELFELD": "CM",
  ZOM: "CAM",
  AM: "CAM",
  "ATTACKING MIDFIELDER": "CAM",
  "ATTACKING MIDFIELD": "CAM",
  "OFFENSIVES MITTELFELD": "CAM",
  "RECHTS FLÜGEL": "RW",
  "RECHTER FLÜGEL": "RW",
  RECHTSFLÜGEL: "RW",
  "RECHTS FLUEGEL": "RW",
  "RECHTER FLUEGEL": "RW",
  RECHTSFLUEGEL: "RW",
  RF: "RW",
  LF: "LW",
  "LEFT WINGER": "LW",
  "RIGHT WINGER": "RW",
  STÜRMER: "ST",
  STUERMER: "ST",
  STRIKER: "ST",
  "SECOND STRIKER": "SS"
};
