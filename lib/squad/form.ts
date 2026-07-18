import type { SquadPlayerInsert, SquadPlayerUpdate } from "@/lib/squad/mappers";

export type SquadPlayerFormField =
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "position"
  | "secondaryPositions"
  | "strongFoot"
  | "club"
  | "playerEmail"
  | "parentPhone"
  | "playerPhone"
  | "parentEmail"
  | "heightCm"
  | "weightKg"
  | "jerseyNumber"
  | "captainStatus"
  | "joinedDate"
  | "allergies"
  | "medication"
  | "medicalNotes"
  | "hobbies"
  | "developmentGoal"
  | "workOn"
  | "notes";

export type SquadPlayerFormValues = Record<SquadPlayerFormField, string>;

export type SquadPlayerFormResult =
  | { ok: true; data: Omit<SquadPlayerInsert, "user_id"> }
  | {
      ok: false;
      error: string;
      fieldErrors: Partial<Record<SquadPlayerFormField, string>>;
      values: SquadPlayerFormValues;
    };

function text(formData: FormData, key: SquadPlayerFormField) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: string) {
  return value ? value : null;
}

function optionalNumber(value: string) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseList(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

export function snapshotSquadPlayerFormValues(formData: FormData): SquadPlayerFormValues {
  return {
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    dateOfBirth: text(formData, "dateOfBirth"),
    position: text(formData, "position"),
    secondaryPositions: text(formData, "secondaryPositions"),
    strongFoot: text(formData, "strongFoot"),
    club: text(formData, "club"),
    playerEmail: text(formData, "playerEmail"),
    parentPhone: text(formData, "parentPhone"),
    playerPhone: text(formData, "playerPhone"),
    parentEmail: text(formData, "parentEmail"),
    heightCm: text(formData, "heightCm"),
    weightKg: text(formData, "weightKg"),
    jerseyNumber: text(formData, "jerseyNumber"),
    captainStatus: text(formData, "captainStatus"),
    joinedDate: text(formData, "joinedDate"),
    allergies: text(formData, "allergies"),
    medication: text(formData, "medication"),
    medicalNotes: text(formData, "medicalNotes"),
    hobbies: text(formData, "hobbies"),
    developmentGoal: text(formData, "developmentGoal"),
    workOn: text(formData, "workOn"),
    notes: text(formData, "notes")
  };
}

export function parseSquadPlayerForm(formData: FormData): SquadPlayerFormResult {
  const values = snapshotSquadPlayerFormValues(formData);
  const fieldErrors: Partial<Record<SquadPlayerFormField, string>> = {};

  if (!values.firstName) fieldErrors.firstName = "Enter the player's first name.";
  if (!isEmail(values.parentEmail)) fieldErrors.parentEmail = "Enter a valid email address.";
  if (!isEmail(values.playerEmail)) fieldErrors.playerEmail = "Enter a valid email address.";
  if (values.heightCm && (Number.parseInt(values.heightCm, 10) < 80 || Number.parseInt(values.heightCm, 10) > 230)) fieldErrors.heightCm = "Use a realistic height in cm.";
  if (values.weightKg && (Number.parseInt(values.weightKg, 10) < 20 || Number.parseInt(values.weightKg, 10) > 180)) fieldErrors.weightKg = "Use a realistic weight in kg.";

  const secondaryPositions = parseList(values.secondaryPositions).filter((position) => position !== values.position);

  const firstError = Object.values(fieldErrors)[0];
  if (firstError) {
    return {
      ok: false,
      error: "Please fix the highlighted player details.",
      fieldErrors,
      values
    };
  }

  return {
    ok: true,
    data: {
      first_name: values.firstName,
      last_name: optionalText(values.lastName),
      date_of_birth: optionalText(values.dateOfBirth),
      position: optionalText(values.position),
      secondary_positions: secondaryPositions,
      strong_foot: optionalText(values.strongFoot),
      club: optionalText(values.club),
      player_email: optionalText(values.playerEmail),
      parent_phone: optionalText(values.parentPhone),
      player_phone: optionalText(values.playerPhone),
      parent_email: optionalText(values.parentEmail),
      height_cm: optionalNumber(values.heightCm),
      weight_kg: optionalNumber(values.weightKg),
      jersey_number: optionalText(values.jerseyNumber),
      captain_status: values.captainStatus === "captain" || values.captainStatus === "vice_captain" ? values.captainStatus : "none",
      joined_date: optionalText(values.joinedDate),
      allergies: optionalText(values.allergies),
      medication: optionalText(values.medication),
      medical_notes: optionalText(values.medicalNotes),
      hobbies: optionalText(values.hobbies),
      development_goal: optionalText(values.developmentGoal),
      work_on: optionalText(values.workOn),
      notes: optionalText(values.notes)
    }
  };
}

export function toSquadPlayerUpdate(data: Omit<SquadPlayerInsert, "user_id">): SquadPlayerUpdate {
  return data;
}
