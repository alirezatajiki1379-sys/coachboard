import type { SquadPlayer } from "@/types/domain";
import { cleanInvisible, normalizeDominantFoot, normalizeGermanPhone, normalizePositions } from "@/lib/squad/intake";

export type ImportSourceType = "xlsx" | "csv" | "paste" | "template";
export type ImportMode = "add_new" | "add_update" | "update_only";
export type ImportOperation = "create" | "update" | "fill_missing" | "skip";
export type MappingConfidence = "high" | "possible" | "confirm" | "unmapped";

export type ImportFieldKey =
  | "ignore"
  | "firstName"
  | "lastName"
  | "fullName"
  | "dateOfBirth"
  | "jerseyNumber"
  | "externalPlayerId"
  | "playerType"
  | "trialStartDate"
  | "joinedDate"
  | "captainStatus"
  | "position"
  | "secondaryPositions"
  | "preferredPositions"
  | "strongFoot"
  | "club"
  | "clubTrainingSchedule"
  | "playerPhone"
  | "playerEmail"
  | "parentGuardianName"
  | "parentPhone"
  | "parentEmail"
  | "emergencyContactName"
  | "emergencyContactPhone"
  | "emergencyContactRelationship"
  | "topSize"
  | "jacketSize"
  | "trouserSize"
  | "shoeSize"
  | "hobbies"
  | "developmentGoal"
  | "workOn"
  | "coachExpectations"
  | "onboardingComments"
  | "recommendedPlayersRaw"
  | "externalResponseId"
  | "formStartDate"
  | "formSubmissionDate"
  | "sourceName"
  | "importBatch";

export type ImportFieldDefinition = {
  key: ImportFieldKey;
  label: string;
  group: string;
  profileField: boolean;
};

export type ColumnMapping = {
  source: string;
  field: ImportFieldKey;
  confidence: MappingConfidence;
  requiresConfirmation?: boolean;
  constantValue?: string;
};

export type ParsedSheet = {
  name: string;
  rows: string[][];
};

export type ImportRowValue = {
  original: string;
  normalized: string;
  warnings: string[];
};

export type ReviewedImportRow = {
  rowNumber: number;
  status: "ready" | "warning" | "error" | "duplicate" | "excluded";
  values: Partial<Record<ImportFieldKey, ImportRowValue>>;
  originalRow: Record<string, string>;
  warnings: string[];
  errors: string[];
  excluded: boolean;
  duplicatePlayerId?: string;
  duplicateSignals: string[];
  operation: ImportOperation;
};

export type PlayerImportPayload = {
  sourceType: ImportSourceType;
  sourceName?: string;
  sourceSheet?: string;
  importMode: ImportMode;
  rows: ReviewedImportRow[];
};

export const importFields: ImportFieldDefinition[] = [
  { key: "ignore", label: "Do not import this column", group: "Mapping", profileField: false },
  { key: "firstName", label: "First name", group: "Identity", profileField: true },
  { key: "lastName", label: "Last name", group: "Identity", profileField: true },
  { key: "fullName", label: "Full name", group: "Identity", profileField: false },
  { key: "dateOfBirth", label: "Date of birth", group: "Identity", profileField: true },
  { key: "jerseyNumber", label: "Jersey number", group: "Identity", profileField: true },
  { key: "externalPlayerId", label: "External player ID", group: "Identity", profileField: true },
  { key: "playerType", label: "Player type", group: "Player status", profileField: true },
  { key: "trialStartDate", label: "Trial start date", group: "Player status", profileField: true },
  { key: "joinedDate", label: "Joined date", group: "Player status", profileField: true },
  { key: "captainStatus", label: "Captain status", group: "Player status", profileField: true },
  { key: "position", label: "Coach-assigned primary position", group: "Football", profileField: true },
  { key: "secondaryPositions", label: "Coach-assigned secondary positions", group: "Football", profileField: true },
  { key: "preferredPositions", label: "Player-preferred positions", group: "Football", profileField: true },
  { key: "strongFoot", label: "Dominant foot", group: "Football", profileField: true },
  { key: "club", label: "Current club", group: "Football", profileField: true },
  { key: "clubTrainingSchedule", label: "Club training schedule", group: "Football", profileField: true },
  { key: "playerPhone", label: "Player phone number", group: "Player contact", profileField: true },
  { key: "playerEmail", label: "Player email address", group: "Player contact", profileField: true },
  { key: "parentGuardianName", label: "Parent or guardian name", group: "Guardian contact", profileField: true },
  { key: "parentPhone", label: "Parent or guardian phone number", group: "Guardian contact", profileField: true },
  { key: "parentEmail", label: "Parent or guardian email address", group: "Guardian contact", profileField: true },
  { key: "emergencyContactName", label: "Emergency contact name", group: "Emergency contact", profileField: true },
  { key: "emergencyContactPhone", label: "Emergency contact phone", group: "Emergency contact", profileField: true },
  { key: "emergencyContactRelationship", label: "Emergency contact relationship", group: "Emergency contact", profileField: true },
  { key: "topSize", label: "Top or shirt size", group: "Equipment", profileField: true },
  { key: "jacketSize", label: "Jacket size", group: "Equipment", profileField: true },
  { key: "trouserSize", label: "Trouser size", group: "Equipment", profileField: true },
  { key: "shoeSize", label: "Shoe size", group: "Equipment", profileField: true },
  { key: "hobbies", label: "Hobbies and interests outside football", group: "Player Voice", profileField: true },
  { key: "developmentGoal", label: "Biggest football goal", group: "Player Voice", profileField: true },
  { key: "workOn", label: "Self-identified development focus", group: "Player Voice", profileField: true },
  { key: "coachExpectations", label: "Expectations and wishes regarding coach/training", group: "Player Voice", profileField: true },
  { key: "onboardingComments", label: "Additional onboarding comments", group: "Player Voice", profileField: true },
  { key: "recommendedPlayersRaw", label: "Recommended or known player information", group: "Recommendations", profileField: true },
  { key: "externalResponseId", label: "External response ID", group: "Import metadata", profileField: false },
  { key: "formStartDate", label: "Form start date", group: "Import metadata", profileField: false },
  { key: "formSubmissionDate", label: "Form submission date", group: "Import metadata", profileField: false },
  { key: "sourceName", label: "Source name", group: "Import metadata", profileField: false },
  { key: "importBatch", label: "Import batch", group: "Import metadata", profileField: false }
];

const fieldByKey = new Map(importFields.map((field) => [field.key, field]));

const mappingAliases: Array<{ field: ImportFieldKey; aliases: string[]; confidence?: MappingConfidence; requiresConfirmation?: boolean }> = [
  { field: "externalResponseId", aliases: ["spalte1", "response id", "antwort id", "external response id"] },
  { field: "formSubmissionDate", aliases: ["spalte2", "submission date", "start date", "submitted", "zeitstempel"], confidence: "confirm", requiresConfirmation: true },
  { field: "firstName", aliases: ["vorname", "first name", "firstname", "given name"] },
  { field: "lastName", aliases: ["nachname", "last name", "surname", "family name"] },
  { field: "fullName", aliases: ["full name", "name", "voller name"] },
  { field: "dateOfBirth", aliases: ["geburtsdatum", "geburtstag", "dob", "date of birth", "birthday"] },
  { field: "playerPhone", aliases: ["telefonnummer spieler", "player phone", "player phone number", "handy spieler"] },
  { field: "parentPhone", aliases: ["telefonnummer erziehungsberechtigten (eltern)", "telefonnummer erziehungsberechtigten", "eltern telefon", "guardian phone", "parent phone"] },
  { field: "parentEmail", aliases: ["e-mail-adresse erziehungsberechtigten", "guardian email", "parent email", "eltern email"] },
  { field: "topSize", aliases: ["klamotten groesse.oberteil", "klamotten größe.oberteil", "top size", "shirt size"] },
  { field: "jacketSize", aliases: ["klamotten groesse.jacke", "klamotten größe.jacke", "jacket size"] },
  { field: "trouserSize", aliases: ["klamotten groesse.hose", "klamotten größe.hose", "trouser size", "pants size"] },
  { field: "shoeSize", aliases: ["schuhgroesse", "schuhgröße", "shoe size"] },
  { field: "club", aliases: ["verein", "aktueller verein", "club", "current club", "team"] },
  { field: "clubTrainingSchedule", aliases: ["trainingszeiten (verein)", "trainingszeiten", "club training schedule"] },
  { field: "preferredPositions", aliases: ["bevorzugte positionen", "preferred positions"] },
  { field: "position", aliases: ["primary position", "coach-assigned primary position"] },
  { field: "secondaryPositions", aliases: ["secondary positions", "coach-assigned secondary positions"] },
  { field: "strongFoot", aliases: ["rechtsfuss oder linksfuss?", "rechtsfuß oder linksfuß?", "starker fuss", "starker fuß", "dominant foot", "preferred foot", "fuss", "fuß"] },
  { field: "hobbies", aliases: ["was sind deine anderen hobbys oder interessen (ausser fussball)?", "was sind deine anderen hobbys oder interessen (außer fußball)?", "hobbies", "hobbies and interests"] },
  { field: "developmentGoal", aliases: ["was ist dein groesstes ziel als fussball spieler?", "was ist dein größtes ziel als fußball spieler?", "biggest football goal"] },
  { field: "workOn", aliases: ["an welchem teil deines spiels moechtest du am meisten arbeiten?", "an welchem teil deines spiels möchtest du am meisten arbeiten?", "self-identified development focus", "work on"] },
  { field: "recommendedPlayersRaw", aliases: ["spalte7"], confidence: "confirm", requiresConfirmation: true },
  { field: "coachExpectations", aliases: ["spalte8"], confidence: "confirm", requiresConfirmation: true }
];

export function suggestColumnMapping(header: string): ColumnMapping {
  const normalized = normalizeHeader(header);
  const match = mappingAliases.find((item) => item.aliases.some((alias) => normalizeHeader(alias) === normalized));
  if (!match) {
    const possible = mappingAliases.find((item) => item.aliases.some((alias) => normalized.includes(normalizeHeader(alias)) || normalizeHeader(alias).includes(normalized)));
    if (possible) return { source: header, field: possible.field, confidence: "possible" };
    return { source: header, field: "ignore", confidence: "unmapped" };
  }
  return {
    source: header,
    field: match.field,
    confidence: match.confidence ?? "high",
    requiresConfirmation: match.requiresConfirmation
  };
}

export function buildReviewedRows(
  headers: string[],
  rows: string[][],
  mappings: ColumnMapping[],
  existingPlayers: SquadPlayer[] = []
): ReviewedImportRow[] {
  const sourceKey = new Set<string>();
  return rows.map((row, index) => {
    const values: Partial<Record<ImportFieldKey, ImportRowValue>> = {};
    const originalRow: Record<string, string> = {};
    const warnings: string[] = [];
    const errors: string[] = [];

    headers.forEach((header, cellIndex) => {
      const original = safeCell(row[cellIndex]);
      originalRow[header] = original;
      const mapping = mappings[cellIndex];
      if (!mapping || mapping.field === "ignore") return;
      const raw = mapping.constantValue?.trim() || original;
      if (!raw) return;
      const normalized = normalizeFieldValue(mapping.field, raw);
      values[mapping.field] = {
        original: raw,
        normalized: normalized.value,
        warnings: normalized.warnings
      };
      warnings.push(...normalized.warnings);
      if (mapping.requiresConfirmation) warnings.push(`${mapping.source} mapping needs confirmation.`);
    });

    applyFullName(values);
    const firstName = valueOf(values.firstName);
    const lastName = valueOf(values.lastName);
    const dateOfBirth = valueOf(values.dateOfBirth);
    if (!firstName && !lastName) errors.push("No player name.");
    if (!dateOfBirth) warnings.push("Date of birth missing.");
    if (!valueOf(values.position)) warnings.push("Primary position missing.");

    const duplicateSignals = duplicateSignalsFor(values, existingPlayers);
    const sourceDuplicateKey = [firstName.toLowerCase(), lastName.toLowerCase(), dateOfBirth].join("|");
    if (sourceDuplicateKey !== "||") {
      if (sourceKey.has(sourceDuplicateKey)) duplicateSignals.push("Duplicate row inside this import source.");
      sourceKey.add(sourceDuplicateKey);
    }
    const duplicate = duplicateSignals[0];
    const matched = duplicate ? findDuplicatePlayer(values, existingPlayers) : undefined;
    const status = errors.length ? "error" : duplicate ? "duplicate" : warnings.length ? "warning" : "ready";
    return {
      rowNumber: index + 2,
      status,
      values,
      originalRow,
      warnings: Array.from(new Set(warnings)),
      errors,
      excluded: false,
      duplicatePlayerId: matched?.id,
      duplicateSignals: Array.from(new Set(duplicateSignals)),
      operation: duplicate ? "skip" : "create"
    };
  });
}

export function normalizeFieldValue(field: ImportFieldKey, rawValue: string): { value: string; warnings: string[] } {
  const raw = cleanText(rawValue);
  if (!raw) return { value: "", warnings: [] };
  if (field === "dateOfBirth" || field === "joinedDate" || field === "trialStartDate" || field === "formStartDate" || field === "formSubmissionDate") {
    const parsed = normalizeDate(raw);
    return parsed.value ? parsed : { value: "", warnings: [`Invalid date: ${raw}`] };
  }
  if (field === "playerPhone" || field === "parentPhone" || field === "emergencyContactPhone") {
    const phone = normalizeGermanPhone(raw);
    return { value: phone.value ?? raw, warnings: phone.warning ? [phone.warning] : [] };
  }
  if (field === "playerEmail" || field === "parentEmail") {
    const email = raw.toLowerCase();
    return { value: email, warnings: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? [] : [`Email format appears invalid: ${raw}`] };
  }
  if (field === "preferredPositions" || field === "secondaryPositions") {
    const positions = normalizePositions(raw);
    return { value: positions.values.join(", "), warnings: positions.warnings };
  }
  if (field === "position") {
    const positions = normalizePositions(raw);
    return { value: positions.values[0] ?? raw, warnings: positions.values.length ? [] : positions.warnings };
  }
  if (field === "strongFoot") {
    const foot = normalizeDominantFoot(raw);
    return { value: foot.value ?? "", warnings: foot.warning ? [foot.warning] : [] };
  }
  if (field === "playerType") {
    const normalized = raw.toLowerCase();
    if (["trial", "test", "probetraining"].some((item) => normalized.includes(item))) return { value: "trial", warnings: [] };
    return { value: "roster", warnings: [] };
  }
  if (field === "captainStatus") {
    const normalized = raw.toLowerCase();
    if (normalized.includes("vice")) return { value: "vice_captain", warnings: [] };
    if (normalized.includes("captain") || normalized.includes("kapitan") || normalized.includes("kapitän")) return { value: "captain", warnings: [] };
    return { value: "none", warnings: [] };
  }
  if (field === "club" && raw.length > 80) return { value: raw, warnings: ["Current club value may contain additional text."] };
  return { value: raw, warnings: [] };
}

export function importFieldLabel(field: ImportFieldKey) {
  return fieldByKey.get(field)?.label ?? field;
}

export function valueOf(value?: ImportRowValue) {
  return value?.normalized?.trim() || "";
}

export function templateCsv() {
  return [
    "First name",
    "Last name",
    "Date of birth",
    "Player type",
    "Trial start date",
    "Jersey number",
    "Coach-assigned primary position",
    "Coach-assigned secondary positions",
    "Player-preferred positions",
    "Dominant foot",
    "Current club",
    "Club training schedule",
    "Player phone",
    "Player email",
    "Guardian name",
    "Guardian phone",
    "Guardian email",
    "Emergency contact name",
    "Emergency contact phone",
    "Top size",
    "Jacket size",
    "Trouser size",
    "Shoe size",
    "Hobbies and interests",
    "Biggest football goal",
    "Self-identified development focus",
    "Expectations and wishes",
    "Additional comments",
    "External player ID"
  ].join(",") + "\n";
}

function applyFullName(values: Partial<Record<ImportFieldKey, ImportRowValue>>) {
  if ((values.firstName || values.lastName) || !values.fullName) return;
  const parts = valueOf(values.fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) return;
  values.firstName = { original: values.fullName.original, normalized: parts[0], warnings: [] };
  if (parts.length > 1) {
    values.lastName = { original: values.fullName.original, normalized: parts.slice(1).join(" "), warnings: ["Full name was split automatically. Please review."] };
  }
}

function duplicateSignalsFor(values: Partial<Record<ImportFieldKey, ImportRowValue>>, players: SquadPlayer[]) {
  const matched = findDuplicatePlayer(values, players);
  if (!matched) return [];
  const signals: string[] = [];
  if (valueOf(values.externalPlayerId) && matched.externalPlayerId === valueOf(values.externalPlayerId)) signals.push("Same external player ID.");
  if (valueOf(values.playerEmail) && matched.playerEmail?.toLowerCase() === valueOf(values.playerEmail).toLowerCase()) signals.push("Same player email.");
  if (
    matched.firstName.toLowerCase() === valueOf(values.firstName).toLowerCase() &&
    (matched.lastName ?? "").toLowerCase() === valueOf(values.lastName).toLowerCase() &&
    matched.dateOfBirth &&
    matched.dateOfBirth === valueOf(values.dateOfBirth)
  ) signals.push("Same first name, last name and date of birth.");
  if (valueOf(values.playerPhone) && matched.playerPhone === valueOf(values.playerPhone)) signals.push("Same player phone.");
  if (valueOf(values.parentEmail) && matched.parentEmail?.toLowerCase() === valueOf(values.parentEmail).toLowerCase()) signals.push("Same guardian email.");
  return signals.length ? signals : ["Possible matching name."];
}

function findDuplicatePlayer(values: Partial<Record<ImportFieldKey, ImportRowValue>>, players: SquadPlayer[]) {
  const externalId = valueOf(values.externalPlayerId);
  const email = valueOf(values.playerEmail).toLowerCase();
  const firstName = valueOf(values.firstName).toLowerCase();
  const lastName = valueOf(values.lastName).toLowerCase();
  const dateOfBirth = valueOf(values.dateOfBirth);
  return players.find((player) => {
    if (externalId && player.externalPlayerId === externalId) return true;
    if (email && player.playerEmail?.toLowerCase() === email) return true;
    if (firstName && lastName && dateOfBirth && player.firstName.toLowerCase() === firstName && (player.lastName ?? "").toLowerCase() === lastName && player.dateOfBirth === dateOfBirth) return true;
    return false;
  });
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  const serial = Number(trimmed);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)));
    return { value: date.toISOString().slice(0, 10), warnings: [] };
  }
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return { value: `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`, warnings: [] };
  const german = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (german) return { value: `${german[3]}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`, warnings: [] };
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return { value: parsed.toISOString().slice(0, 10), warnings: [] };
  return { value: "", warnings: [`Invalid date: ${value}`] };
}

function cleanText(value: string) {
  return cleanInvisible(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function safeCell(value: unknown) {
  if (value === null || value === undefined) return "";
  return cleanText(String(value));
}

function normalizeHeader(value: string) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");
}
