type PositionFamily = "goalkeeper" | "defensive" | "midfield" | "attacking";

type CanonicalPositionDefinition = {
  code: string;
  label: string;
  family: PositionFamily;
  aliases: string[];
};

const canonicalPositions: CanonicalPositionDefinition[] = [
  {
    code: "GK",
    label: "Goalkeeper",
    family: "goalkeeper",
    aliases: [
      "GK", "TW", "T", "Tor", "Im Tor", "Torwart", "Torhüter", "Torhueter", "Torhüterin", "Torhueterin",
      "Keeper", "Keeperin", "Goalie", "Goalkeeper", "Goal keeper", "Goal-keeper", "Goalkeeping", "Tormann", "Torfrau"
    ]
  },
  {
    code: "CB",
    label: "Centre Back",
    family: "defensive",
    aliases: [
      "CB", "IV", "Innenverteidiger", "Innenverteidigerin", "Innenverteidigung", "Innenverteidiger zentral",
      "Zentraler Verteidiger", "Zentrale Verteidigerin", "Zentralverteidiger", "Zentralverteidigung",
      "Center Back", "Centre Back", "Center-Back", "Centre-Back", "Central Defender", "Central Defence",
      "Central Defense", "Stopper", "Stopperin", "Libero", "Sweeper", "SW"
    ]
  },
  {
    code: "RB",
    label: "Right Back",
    family: "defensive",
    aliases: [
      "RB", "RV", "RAV", "Rechtsverteidiger", "Rechtsverteidigerin", "Rechter Verteidiger", "Rechte Verteidigerin",
      "Verteidiger rechts", "Verteidigerin rechts", "Außenverteidiger rechts", "Aussenverteidiger rechts",
      "Rechter Außenverteidiger", "Rechter Aussenverteidiger", "Rechte Außenverteidigerin", "Rechte Aussenverteidigerin",
      "Right Back", "Right-Back", "Right Fullback", "Right Full-Back", "Right Defender", "Fullback rechts",
      "Außenverteidigung rechts", "Aussenverteidigung rechts"
    ]
  },
  {
    code: "LB",
    label: "Left Back",
    family: "defensive",
    aliases: [
      "LB", "LV", "LAV", "Linksverteidiger", "Linksverteidigerin", "Linker Verteidiger", "Linke Verteidigerin",
      "Verteidiger links", "Verteidigerin links", "Außenverteidiger links", "Aussenverteidiger links",
      "Linker Außenverteidiger", "Linker Aussenverteidiger", "Linke Außenverteidigerin", "Linke Aussenverteidigerin",
      "Left Back", "Left-Back", "Left Fullback", "Left Full-Back", "Left Defender", "Fullback links",
      "Außenverteidigung links", "Aussenverteidigung links"
    ]
  },
  {
    code: "RWB",
    label: "Right Wing-Back",
    family: "defensive",
    aliases: [
      "RWB", "Rechter Wingback", "Rechte Wingback", "Wingback rechts", "Wing-Back rechts", "Rechter Schienenspieler",
      "Rechte Schienenspielerin", "Schienenspieler rechts", "Schiene rechts", "Rechte Schiene",
      "Außenbahn rechts defensiv", "Aussenbahn rechts defensiv", "Right Wingback", "Right Wing-Back", "Right-sided Wingback"
    ]
  },
  {
    code: "LWB",
    label: "Left Wing-Back",
    family: "defensive",
    aliases: [
      "LWB", "Linker Wingback", "Linke Wingback", "Wingback links", "Wing-Back links", "Linker Schienenspieler",
      "Linke Schienenspielerin", "Schienenspieler links", "Schiene links", "Linke Schiene",
      "Außenbahn links defensiv", "Aussenbahn links defensiv", "Left Wingback", "Left Wing-Back", "Left-sided Wingback"
    ]
  },
  {
    code: "CDM",
    label: "Defensive Midfielder",
    family: "midfield",
    aliases: [
      "CDM", "DM", "ZDM", "6", "6er", "6-er", "Sechs", "Sechser", "Sechserposition", "Auf der Sechs",
      "Auf der 6", "Doppel-6", "Doppelsechs", "Defensives Mittelfeld", "Defensiver Mittelfeldspieler",
      "Defensive Mittelfeldspielerin", "Defensiv zentral im Mittelfeld", "Defensive Midfield", "Defensive Midfielder",
      "Holding Midfielder", "Holding Midfield", "Holding Six", "Number Six", "Deep-Lying Midfielder", "Abräumer", "Abräumerin"
    ]
  },
  {
    code: "CM",
    label: "Central Midfielder",
    family: "midfield",
    aliases: [
      "CM", "ZM", "8", "8er", "8-er", "Acht", "Achter", "Achterposition", "Auf der Acht", "Auf der 8",
      "Zentrales Mittelfeld", "Zentraler Mittelfeldspieler", "Zentrale Mittelfeldspielerin", "Mittelfeld zentral",
      "Central Midfield", "Central Midfielder", "Centre Midfield", "Number Eight", "Box-to-Box", "Box to Box",
      "Box-to-Box Midfielder", "B2B", "Allrounder im Mittelfeld"
    ]
  },
  {
    code: "CAM",
    label: "Attacking Midfielder",
    family: "midfield",
    aliases: [
      "CAM", "AM", "OM", "ZOM", "10", "10er", "10-er", "Zehn", "Zehner", "Zehnerposition", "Auf der Zehn",
      "Auf der 10", "Offensives Mittelfeld", "Offensiver Mittelfeldspieler", "Offensive Mittelfeldspielerin",
      "Zentrales offensives Mittelfeld", "Attacking Midfield", "Attacking Midfielder", "Advanced Midfielder",
      "Number Ten", "Playmaker", "Spielmacher", "Spielmacherin", "Offensiver Spielmacher", "Offensive Spielmacherin"
    ]
  },
  {
    code: "RM",
    label: "Right Midfielder",
    family: "midfield",
    aliases: [
      "RM", "Rechtes Mittelfeld", "Rechter Mittelfeldspieler", "Rechte Mittelfeldspielerin", "Mittelfeld rechts",
      "Außenmittelfeld rechts", "Aussenmittelfeld rechts", "Rechter Außenmittelfeldspieler", "Rechte Außenmittelfeldspielerin",
      "Right Midfield", "Right Midfielder", "Right-Sided Midfielder", "Wide Midfielder Right"
    ]
  },
  {
    code: "LM",
    label: "Left Midfielder",
    family: "midfield",
    aliases: [
      "LM", "Linkes Mittelfeld", "Linker Mittelfeldspieler", "Linke Mittelfeldspielerin", "Mittelfeld links",
      "Außenmittelfeld links", "Aussenmittelfeld links", "Linker Außenmittelfeldspieler", "Linke Außenmittelfeldspielerin",
      "Left Midfield", "Left Midfielder", "Left-Sided Midfielder", "Wide Midfielder Left"
    ]
  },
  {
    code: "RW",
    label: "Right Winger",
    family: "attacking",
    aliases: [
      "RW", "RF", "RA", "Rechtsaußen", "Rechtsaussen", "Rechter Außen", "Rechter Aussen",
      "Rechte Außenbahn offensiv", "Rechte Aussenbahn offensiv", "Rechter Außenstürmer", "Rechter Aussenstürmer",
      "Rechte Außenstürmerin", "Rechte Aussenstürmerin", "Rechts Außen", "Rechts Aussen", "Rechts Flügel", "Rechter Flügel", "Rechte Flügelspielerin",
      "Rechtsflügel", "Flügel rechts", "Fluegel rechts", "Rechter Winger", "Rechte Wingerin", "Right Wing",
      "Right Winger", "Right Forward", "Right-Sided Forward", "Right-Sided Winger", "Wide Forward Right"
    ]
  },
  {
    code: "LW",
    label: "Left Winger",
    family: "attacking",
    aliases: [
      "LW", "LF", "LA", "Linksaußen", "Linksaussen", "Linker Außen", "Linker Aussen",
      "Linke Außenbahn offensiv", "Linke Aussenbahn offensiv", "Linker Außenstürmer", "Linker Aussenstürmer",
      "Linke Außenstürmerin", "Linke Aussenstürmerin", "Links Außen", "Links Aussen", "Links Flügel", "Linker Flügel", "Linke Flügelspielerin",
      "Linksflügel", "Flügel links", "Fluegel links", "Linker Winger", "Linke Wingerin", "Left Wing",
      "Left Winger", "Left Forward", "Left-Sided Forward", "Left-Sided Winger", "Wide Forward Left"
    ]
  },
  {
    code: "SS",
    label: "Second Striker",
    family: "attacking",
    aliases: ["SS", "HS", "Hängende Spitze", "Haengende Spitze", "Zweite Spitze", "Halbstürmer", "Halbstuermer", "Second Striker", "Second Forward", "Shadow Striker", "Support Striker", "Supporting Forward"]
  },
  {
    code: "ST",
    label: "Striker",
    family: "attacking",
    aliases: [
      "ST", "CF", "MS", "9", "9er", "9-er", "Neun", "Neuner", "Neunerposition", "Auf der Neun", "Auf der 9",
      "Stürmer", "Stuermer", "Stürmerin", "Sturm", "Mittelstürmer", "Mittelstuermer", "Mittelstürmerin",
      "Zentraler Stürmer", "Zentraler Stuermer", "Zentrale Stürmerin", "Angreifer", "Angreiferin", "Spitze",
      "Zentrale Spitze", "Striker", "Forward", "Centre Forward", "Center Forward", "Central Forward", "Number Nine",
      "Target Man", "Target Player"
    ]
  }
];

const ambiguousTerms = [
  "Allrounder", "Allrounderin", "Überall", "Ueberall", "Flexibel", "Flexible", "Mehrere Positionen", "Alles außer Tor",
  "Alles ausser Tor", "Defensiv flexibel", "Offensiv flexibel", "Zentral", "Außenbahn", "Aussenbahn", "Links und rechts",
  "Beide Seiten", "Universalspieler", "Universalspielerin"
];

const familyTerms: Record<PositionFamily, string[]> = {
  goalkeeper: [],
  defensive: ["Defensiv", "Abwehr", "Verteidigung", "Verteidiger", "Verteidigerin", "Defender", "Defence", "Defense", "Außenverteidiger", "Aussenverteidiger", "Außenverteidigerin", "Aussenverteidigerin", "Fullback", "Full-Back"],
  midfield: ["Mittelfeld", "Mittelfeldspieler", "Mittelfeldspielerin", "Midfield", "Midfielder"],
  attacking: ["Offensive", "Offensiv", "Angriff", "Attack", "Attacking player", "Flügel", "Fluegel", "Flügelspieler", "Fluegelspieler", "Flügelspielerin", "Winger", "Außenstürmer", "Aussenstürmer", "Außenbahn offensiv", "Aussenbahn offensiv", "Wingback", "Wing-Back", "Schienenspieler", "Schienenspielerin", "Schiene"]
};

const exactAliasMap = new Map<string, string>();
const searchableAliases: Array<{ key: string; code: string }> = [];

for (const position of canonicalPositions) {
  for (const alias of position.aliases) {
    const key = normalizeKey(alias);
    exactAliasMap.set(key, position.code);
    searchableAliases.push({ key, code: position.code });
  }
}

searchableAliases.sort((a, b) => b.key.length - a.key.length);

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
  const cleaned = cleanInvisible(raw).trim();
  if (!cleaned) return { values: [], warnings: [] };

  const warnings: string[] = [];
  const directValues = aliasesForValue(cleaned);
  const values = directValues.length ? directValues : splitValues(cleaned).flatMap((value) => normalizePositionChunk(value, warnings));

  if (!values.length) {
    const family = detectFamily(cleaned);
    if (family) warnings.push(`Position family recognized (${family}), exact position needs review: ${cleaned}`);
    else if (isAmbiguous(cleaned)) warnings.push(`Ambiguous position description needs review: ${cleaned}`);
    else warnings.push(`Unknown position: ${cleaned}`);
  }

  return {
    values: Array.from(new Set(values)),
    warnings: Array.from(new Set(warnings))
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

function normalizePositionChunk(value: string, warnings: string[]) {
  const aliases = aliasesForValue(value);
  if (aliases.length) return aliases;

  const sentenceMatches = findAliasesInSentence(value);
  if (sentenceMatches.length) return sentenceMatches;

  const family = detectFamily(value);
  if (family) {
    warnings.push(`Position family recognized (${family}), exact position needs review: ${value}`);
    return [];
  }

  if (isAmbiguous(value)) {
    warnings.push(`Ambiguous position description needs review: ${value}`);
    return [];
  }

  const fuzzy = fuzzyAlias(value);
  if (fuzzy) return [fuzzy];

  warnings.push(`Unknown position: ${value}`);
  return [];
}

function aliasesForValue(value: string) {
  const key = normalizeKey(value);
  const strippedTrailingParentheses = key.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  const strippedAllParentheses = key.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const exact = exactAliasMap.get(key) ?? exactAliasMap.get(strippedTrailingParentheses) ?? exactAliasMap.get(strippedAllParentheses);
  if (exact) return [exact];

  if (key.includes("links-und rechtsverteidiger") || key.includes("links- und rechtsverteidiger") || key.includes("links und rechtsverteidiger") || key.includes("links und rechts verteidiger")) return ["LB", "RB"];
  if (key.includes("rechts-und linksverteidiger") || key.includes("rechts- und linksverteidiger") || key.includes("rechts und linksverteidiger") || key.includes("rechts und links verteidiger")) return ["RB", "LB"];
  return [];
}

function findAliasesInSentence(value: string) {
  const normalizedSentence = ` ${normalizeKey(value).replace(/\b(?:ich spiele|meine position ist|am liebsten|bevorzugt|hauptsachlich|hauptsaechlich|meistens|manchmal|kann aber auch|kann auch|alternativ|zweite position|nebenposition|primar|primaer|sekundar|sekundaer|position|gerne|eher|als|auf der|auf dem|spielen)\b/g, " ").replace(/\s+/g, " ")} `;
  const matches: Array<{ index: number; code: string; length: number }> = [];
  const occupied: Array<[number, number]> = [];

  for (const alias of searchableAliases) {
    if (alias.key.length < 2 && !/^\d$/.test(alias.key)) continue;
    const index = normalizedSentence.indexOf(` ${alias.key} `);
    if (index === -1) continue;
    const start = index + 1;
    const end = start + alias.key.length;
    if (occupied.some(([takenStart, takenEnd]) => start < takenEnd && end > takenStart)) continue;
    matches.push({ index: start, code: alias.code, length: alias.key.length });
    occupied.push([start, end]);
  }

  return matches
    .sort((a, b) => a.index - b.index || b.length - a.length)
    .map((match) => match.code)
    .filter((code, index, list) => list.indexOf(code) === index);
}

function detectFamily(value: string) {
  const key = normalizeKey(value);
  for (const [family, terms] of Object.entries(familyTerms) as Array<[PositionFamily, string[]]>) {
    if (terms.some((term) => normalizeKey(term) === key)) return family;
  }
  return undefined;
}

function isAmbiguous(value: string) {
  const key = normalizeKey(value);
  return ambiguousTerms.some((term) => normalizeKey(term) === key);
}

function fuzzyAlias(value: string) {
  const key = normalizeKey(value);
  if (key.length < 5) return undefined;
  const candidates = searchableAliases
    .filter((alias) => Math.abs(alias.key.length - key.length) <= 4 && alias.key.length >= 5)
    .map((alias) => ({ ...alias, distance: levenshtein(key, alias.key) }))
    .sort((a, b) => a.distance - b.distance || b.key.length - a.key.length);
  const [best, second] = candidates;
  if (!best) return undefined;
  const threshold = key.length <= 10 ? 2 : 3;
  if (best.distance > threshold) return undefined;
  if (second && second.distance - best.distance < 2 && second.code !== best.code) return undefined;
  return best.code;
}

function splitValues(value: string) {
  return value
    .replace(/\b(?:und\/oder|bzw\.?|and)\b/gi, ",")
    .replace(/\s(?:und|oder)\s/gi, ",")
    .split(/[,;/|\\\n+&]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeKey(value: string) {
  return cleanInvisible(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/\bfluegel\b/g, "flugel")
    .replace(/\baussen\b/g, "aussen")
    .replace(/\bstuermer\b/g, "sturmer")
    .replace(/\btorhueter\b/g, "torhuter")
    .replace(/[–—]/g, "-")
    .replace(/[.!?:"]/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_j, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function formatPhone(value: string) {
  if (!value.startsWith("+49")) return value;
  const rest = value.slice(3);
  if (rest.length <= 3) return `+49 ${rest}`;
  return `+49 ${rest.slice(0, 3)} ${rest.slice(3)}`;
}
