import type { SquadPlayerInsert, SquadPlayerUpdate } from "@/lib/squad/mappers";

export type SquadPlayerFormField =
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "position"
  | "secondaryPositions"
  | "strongFoot"
  | "club"
  | "originalClub"
  | "clubTrainingSchedule"
  | "playerEmail"
  | "parentGuardianName"
  | "parentPhone"
  | "playerPhone"
  | "parentEmail"
  | "emergencyContactName"
  | "emergencyContactPhone"
  | "topSize"
  | "jacketSize"
  | "trouserSize"
  | "shoeSize"
  | "preferredPositions"
  | "originalPreferredPositions"
  | "originalStrongFoot"
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
  | "coachExpectations"
  | "onboardingComments"
  | "recommendedPlayersRaw"
  | "recommendedPlayerName"
  | "recommendedPlayerBirthYear"
  | "recommendedPlayerPosition"
  | "recommendedPlayerClub"
  | "onboardingSource"
  | "onboardingSubmittedAt"
  | "onboardingImportBatch"
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
    originalClub: text(formData, "originalClub"),
    clubTrainingSchedule: text(formData, "clubTrainingSchedule"),
    playerEmail: text(formData, "playerEmail"),
    parentGuardianName: text(formData, "parentGuardianName"),
    parentPhone: text(formData, "parentPhone"),
    playerPhone: text(formData, "playerPhone"),
    parentEmail: text(formData, "parentEmail"),
    emergencyContactName: text(formData, "emergencyContactName"),
    emergencyContactPhone: text(formData, "emergencyContactPhone"),
    topSize: text(formData, "topSize"),
    jacketSize: text(formData, "jacketSize"),
    trouserSize: text(formData, "trouserSize"),
    shoeSize: text(formData, "shoeSize"),
    preferredPositions: text(formData, "preferredPositions"),
    originalPreferredPositions: text(formData, "originalPreferredPositions"),
    originalStrongFoot: text(formData, "originalStrongFoot"),
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
    coachExpectations: text(formData, "coachExpectations"),
    onboardingComments: text(formData, "onboardingComments"),
    recommendedPlayersRaw: text(formData, "recommendedPlayersRaw"),
    recommendedPlayerName: text(formData, "recommendedPlayerName"),
    recommendedPlayerBirthYear: text(formData, "recommendedPlayerBirthYear"),
    recommendedPlayerPosition: text(formData, "recommendedPlayerPosition"),
    recommendedPlayerClub: text(formData, "recommendedPlayerClub"),
    onboardingSource: text(formData, "onboardingSource"),
    onboardingSubmittedAt: text(formData, "onboardingSubmittedAt"),
    onboardingImportBatch: text(formData, "onboardingImportBatch"),
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
  const preferredPositions = parseList(values.preferredPositions);

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
      original_club: optionalText(values.originalClub),
      club_training_schedule: optionalText(values.clubTrainingSchedule),
      player_email: optionalText(values.playerEmail),
      parent_guardian_name: optionalText(values.parentGuardianName),
      parent_phone: optionalText(values.parentPhone),
      player_phone: optionalText(values.playerPhone),
      parent_email: optionalText(values.parentEmail),
      emergency_contact_name: optionalText(values.emergencyContactName),
      emergency_contact_phone: optionalText(values.emergencyContactPhone),
      top_size: optionalText(values.topSize),
      jacket_size: optionalText(values.jacketSize),
      trouser_size: optionalText(values.trouserSize),
      shoe_size: optionalText(values.shoeSize),
      preferred_positions: preferredPositions,
      original_preferred_positions: optionalText(values.originalPreferredPositions),
      original_strong_foot: optionalText(values.originalStrongFoot),
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
      coach_expectations: optionalText(values.coachExpectations),
      onboarding_comments: optionalText(values.onboardingComments),
      recommended_players_raw: optionalText(values.recommendedPlayersRaw),
      recommended_player_name: optionalText(values.recommendedPlayerName),
      recommended_player_birth_year: optionalText(values.recommendedPlayerBirthYear),
      recommended_player_position: optionalText(values.recommendedPlayerPosition),
      recommended_player_club: optionalText(values.recommendedPlayerClub),
      onboarding_source: optionalText(values.onboardingSource),
      onboarding_submitted_at: optionalText(values.onboardingSubmittedAt),
      onboarding_import_batch: optionalText(values.onboardingImportBatch),
      notes: optionalText(values.notes)
    }
  };
}

export function toSquadPlayerUpdate(data: Omit<SquadPlayerInsert, "user_id">): SquadPlayerUpdate {
  return data;
}
