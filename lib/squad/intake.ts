const positionAliases: Record<string, string> = {
  tw: "GK",
  torwart: "GK",
  keeper: "GK",
  goalkeeper: "GK",
  gk: "GK",
  iv: "CB",
  innenverteidiger: "CB",
  "centre-back": "CB",
  "center-back": "CB",
  "centre back": "CB",
  "center back": "CB",
  "central defender": "CB",
  "zentrale verteidigung": "CB",
  cb: "CB",
  rv: "RB",
  rechtsverteidiger: "RB",
  "right-back": "RB",
  "right back": "RB",
  rb: "RB",
  lv: "LB",
  linksverteidiger: "LB",
  "left-back": "LB",
  "left back": "LB",
  lb: "LB",
  wingback: "WB",
  "wing-back": "WB",
  "wing back": "WB",
  "6er": "CDM",
  sechser: "CDM",
  zdm: "CDM",
  cdm: "CDM",
  "defensive midfielder": "CDM",
  "defensive midfield": "CDM",
  "defensives mittelfeld": "CDM",
  dm: "CDM",
  "8er": "CM",
  achter: "CM",
  zm: "CM",
  "central midfielder": "CM",
  "central midfield": "CM",
  "zentrales mittelfeld": "CM",
  cm: "CM",
  "10er": "CAM",
  zehner: "CAM",
  zom: "CAM",
  om: "CAM",
  "attacking midfielder": "CAM",
  "attacking midfield": "CAM",
  "attacking midfielders": "CAM",
  "offensives mittelfeld": "CAM",
  cam: "CAM",
  am: "CAM",
  rf: "RW",
  ra: "RW",
  "rechts flugel": "RW",
  "rechts flügel": "RW",
  "rechter flugel": "RW",
  "rechter flügel": "RW",
  rechtsflugel: "RW",
  rechtsflügel: "RW",
  "right winger": "RW",
  "right wing": "RW",
  rw: "RW",
  lf: "LW",
  la: "LW",
  "left winger": "LW",
  "left wing": "LW",
  lw: "LW",
  winger: "RW",
  flugel: "RW",
  flügel: "RW",
  st: "ST",
  sturmer: "ST",
  stürmer: "ST",
  striker: "ST",
  "centre-forward": "ST",
  "center-forward": "ST",
  "centre forward": "ST",
  "center forward": "ST",
  cf: "ST",
  lm: "LM",
  rm: "RM",
  lav: "LWB",
  rav: "RWB"
};

const footAliases: Record<string, "Right" | "Left" | "Both"> = {
  rechtsfuss: "Right",
  rechtsfuß: "Right",
  right: "Right",
  "right-footed": "Right",
  linksfuss: "Left",
  linksfuß: "Left",
  left: "Left",
  "left-footed": "Left",
  both: "Both",
  either: "Both",
  beidfussig: "Both",
  beidfüßig: "Both",
  "both feet": "Both"
};

export type NormalizedListResult = {
  values: string[];
  warnings: string[];
};

export type NormalizedValueResult = {
  value?: string;
  warning?: string;
};

export function normalizePositions(raw: string): NormalizedListResult {
  const warnings: string[] = [];
  const values = splitValues(raw)
    .map((value) => {
      const normalized = lookupPositionAlias(value);
      if (!normalized) warnings.push(`Unknown position: ${value}`);
      return normalized;
    })
    .filter((value): value is string => Boolean(value));

  return {
    values: Array.from(new Set(values)),
    warnings
  };
}

export function normalizeDominantFoot(raw: string): NormalizedValueResult {
  if (!raw.trim()) return {};
  const value = footAliases[normalizeKey(raw)];
  if (value) return { value };
  return { warning: `Unknown dominant foot: ${raw}` };
}

export function normalizeGermanPhone(raw: string): NormalizedValueResult {
  const cleaned = cleanInvisible(raw).trim();
  if (!cleaned) return {};
  const compact = cleaned.replace(/[^\d+]/g, "");
  if (compact.startsWith("+")) return { value: formatPhone(compact) };
  if (compact.startsWith("00")) return { value: formatPhone(`+${compact.slice(2)}`) };
  if (compact.startsWith("0") && compact.length >= 8) return { value: formatPhone(`+49${compact.slice(1)}`) };
  if (/^\d{8,}$/.test(compact)) return { value: formatPhone(compact) };
  return { value: cleaned, warning: `Phone number could not be normalized: ${raw}` };
}

export function cleanInvisible(value: string) {
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}

function splitValues(value: string) {
  return value
    .split(/[,;/|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeKey(value: string) {
  return cleanInvisible(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function lookupPositionAlias(value: string) {
  const key = normalizeKey(value);
  return (
    positionAliases[key] ??
    positionAliases[key.replace(/\s*\([^)]*\)\s*$/g, "").trim()] ??
    positionAliases[key.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim()]
  );
}

function formatPhone(value: string) {
  if (!value.startsWith("+49")) return value;
  const rest = value.slice(3);
  if (rest.length <= 3) return `+49 ${rest}`;
  return `+49 ${rest.slice(0, 3)} ${rest.slice(3)}`;
}
