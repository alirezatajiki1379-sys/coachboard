import type { SquadPlayerInsert, SquadPlayerUpdate } from "@/lib/squad/mappers";

export type SquadPlayerFormField =
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "position"
  | "strongFoot"
  | "club"
  | "parentPhone"
  | "playerPhone"
  | "parentEmail"
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

function isEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function snapshotSquadPlayerFormValues(formData: FormData): SquadPlayerFormValues {
  return {
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    dateOfBirth: text(formData, "dateOfBirth"),
    position: text(formData, "position"),
    strongFoot: text(formData, "strongFoot"),
    club: text(formData, "club"),
    parentPhone: text(formData, "parentPhone"),
    playerPhone: text(formData, "playerPhone"),
    parentEmail: text(formData, "parentEmail"),
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
      strong_foot: optionalText(values.strongFoot),
      club: optionalText(values.club),
      parent_phone: optionalText(values.parentPhone),
      player_phone: optionalText(values.playerPhone),
      parent_email: optionalText(values.parentEmail),
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
