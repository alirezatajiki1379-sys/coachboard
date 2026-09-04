import type { SquadPlayerInsert, SquadPlayerUpdate } from "@/lib/squad/mappers";
import { normalizePositions } from "@/lib/squad/intake";

export type SquadPlayerFormField =
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "addressStreet"
  | "addressPostalCode"
  | "addressCity"
  | "position"
  | "positionFamilies"
  | "secondaryPositions"
  | "strongFoot"
  | "club"
  | "originalClub"
  | "clubTrainingSchedule"
  | "externalPlayerId"
  | "playerType"
  | "trialStartDate"
  | "trialDurationMode"
  | "trialTrainingLimit"
  | "trialEndDate"
  | "playerEmail"
  | "secondaryEmail"
  | "parentGuardianName"
  | "parentPhone"
  | "playerPhone"
  | "parentEmail"
  | "emergencyContactName"
  | "emergencyContactPhone"
  | "emergencyContactRelationship"
  | "topSize"
  | "jacketSize"
  | "trouserSize"
  | "shoeSize"
  | "preferredPositions"
  | "originalPreferredPositions"
  | "originalStrongFoot"
  | "heightCm"
  | "weightKg"
  | "distanceKm"
  | "jerseyNumber"
  | "captainStatus"
  | "joinedDate"
  | "exitDate"
  | "exitReason"
  | "scoutingSource"
  | "developmentCentre"
  | "lastPerformanceReviewDate"
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
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function isEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseList(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

function normalizePositionInput(value: string) {
  if (!value) return "";
  return normalizePositions(value).values[0] ?? value;
}

function normalizePositionListInput(value: string) {
  if (!value) return [];
  const normalized = normalizePositions(value).values;
  return normalized.length ? normalized : parseList(value);
}

export function snapshotSquadPlayerFormValues(formData: FormData): SquadPlayerFormValues {
  return {
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    dateOfBirth: text(formData, "dateOfBirth"),
    addressStreet: text(formData, "addressStreet"),
    addressPostalCode: text(formData, "addressPostalCode"),
    addressCity: text(formData, "addressCity"),
    position: text(formData, "position"),
    positionFamilies: text(formData, "positionFamilies"),
    secondaryPositions: text(formData, "secondaryPositions"),
    strongFoot: text(formData, "strongFoot"),
    club: text(formData, "club"),
    originalClub: text(formData, "originalClub"),
    clubTrainingSchedule: text(formData, "clubTrainingSchedule"),
    externalPlayerId: text(formData, "externalPlayerId"),
    playerType: text(formData, "playerType"),
    trialStartDate: text(formData, "trialStartDate"),
    trialDurationMode: text(formData, "trialDurationMode"),
    trialTrainingLimit: text(formData, "trialTrainingLimit"),
    trialEndDate: text(formData, "trialEndDate"),
    playerEmail: text(formData, "playerEmail"),
    secondaryEmail: text(formData, "secondaryEmail"),
    parentGuardianName: text(formData, "parentGuardianName"),
    parentPhone: text(formData, "parentPhone"),
    playerPhone: text(formData, "playerPhone"),
    parentEmail: text(formData, "parentEmail"),
    emergencyContactName: text(formData, "emergencyContactName"),
    emergencyContactPhone: text(formData, "emergencyContactPhone"),
    emergencyContactRelationship: text(formData, "emergencyContactRelationship"),
    topSize: text(formData, "topSize"),
    jacketSize: text(formData, "jacketSize"),
    trouserSize: text(formData, "trouserSize"),
    shoeSize: text(formData, "shoeSize"),
    preferredPositions: text(formData, "preferredPositions"),
    originalPreferredPositions: text(formData, "originalPreferredPositions"),
    originalStrongFoot: text(formData, "originalStrongFoot"),
    heightCm: text(formData, "heightCm"),
    weightKg: text(formData, "weightKg"),
    distanceKm: text(formData, "distanceKm"),
    jerseyNumber: text(formData, "jerseyNumber"),
    captainStatus: text(formData, "captainStatus"),
    joinedDate: text(formData, "joinedDate"),
    exitDate: text(formData, "exitDate"),
    exitReason: text(formData, "exitReason"),
    scoutingSource: text(formData, "scoutingSource"),
    developmentCentre: text(formData, "developmentCentre"),
    lastPerformanceReviewDate: text(formData, "lastPerformanceReviewDate"),
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
  if (!isEmail(values.secondaryEmail)) fieldErrors.secondaryEmail = "Enter a valid email address.";
  const height = optionalNumber(values.heightCm);
  const weight = optionalNumber(values.weightKg);
  const distance = optionalNumber(values.distanceKm);
  if (values.heightCm && (height === null || height < 80 || height > 230)) fieldErrors.heightCm = "Use a realistic height in cm.";
  if (values.weightKg && (weight === null || weight < 20 || weight > 180)) fieldErrors.weightKg = "Use a realistic weight in kg.";
  if (values.distanceKm && (distance === null || distance < 0 || distance > 500)) fieldErrors.distanceKm = "Use a realistic distance in km.";
  if (values.trialTrainingLimit && Number.parseInt(values.trialTrainingLimit, 10) < 1) fieldErrors.trialTrainingLimit = "Use at least 1 training.";

  const primaryPosition = normalizePositionInput(values.position);
  const secondaryPositions = normalizePositionListInput(values.secondaryPositions).filter((position) => position !== primaryPosition);
  const preferredPositions = normalizePositionListInput(values.preferredPositions);

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
      address_street: optionalText(values.addressStreet),
      address_postal_code: optionalText(values.addressPostalCode),
      address_city: optionalText(values.addressCity),
      position: optionalText(primaryPosition),
      position_families: parseList(values.positionFamilies),
      secondary_positions: secondaryPositions,
      strong_foot: optionalText(values.strongFoot),
      club: optionalText(values.club),
      original_club: optionalText(values.originalClub),
      club_training_schedule: optionalText(values.clubTrainingSchedule),
      external_player_id: optionalText(values.externalPlayerId),
      player_type: values.playerType === "trial" ? "trial" : "roster",
      trial_start_date: optionalText(values.trialStartDate),
      trial_duration_mode:
        values.playerType === "trial" && (values.trialDurationMode === "training_count" || values.trialDurationMode === "end_date")
          ? values.trialDurationMode
          : null,
      trial_training_limit: values.playerType === "trial" && values.trialDurationMode === "training_count" ? optionalNumber(values.trialTrainingLimit) : null,
      trial_end_date: values.playerType === "trial" && values.trialDurationMode === "end_date" ? optionalText(values.trialEndDate) : null,
      player_email: optionalText(values.playerEmail),
      secondary_email: optionalText(values.secondaryEmail),
      parent_guardian_name: optionalText(values.parentGuardianName),
      parent_phone: optionalText(values.parentPhone),
      player_phone: optionalText(values.playerPhone),
      parent_email: optionalText(values.parentEmail),
      emergency_contact_name: optionalText(values.emergencyContactName),
      emergency_contact_phone: optionalText(values.emergencyContactPhone),
      emergency_contact_relationship: optionalText(values.emergencyContactRelationship),
      top_size: optionalText(values.topSize),
      jacket_size: optionalText(values.jacketSize),
      trouser_size: optionalText(values.trouserSize),
      shoe_size: optionalText(values.shoeSize),
      preferred_positions: preferredPositions,
      original_preferred_positions: optionalText(values.originalPreferredPositions),
      original_strong_foot: optionalText(values.originalStrongFoot),
      height_cm: height,
      weight_kg: weight,
      distance_km: distance,
      jersey_number: optionalText(values.jerseyNumber),
      captain_status: values.captainStatus === "captain" || values.captainStatus === "vice_captain" ? values.captainStatus : "none",
      joined_date: optionalText(values.joinedDate),
      exit_date: optionalText(values.exitDate),
      exit_reason: optionalText(values.exitReason),
      scouting_source: optionalText(values.scoutingSource),
      development_centre: optionalText(values.developmentCentre),
      last_performance_review_date: optionalText(values.lastPerformanceReviewDate),
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
