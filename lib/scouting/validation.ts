import { normalizeCanonicalPosition } from "@/lib/squad/positions";
import type { ScoutingObservationRow, ScoutingPlayerRow, ScoutingTargetRow } from "@/types/database";

export function formText(form: FormData, name: string, max = 4000) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function optional(value: string) { return value || null; }

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function optionalNumber(form: FormData, name: string, min: number, max: number) {
  const raw = formText(form, name, 20).replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Check ${name}.`);
  return value;
}

export function option<T extends string>(value: string, choices: readonly T[], fallback: T): T {
  return choices.find((choice) => choice === value) ?? fallback;
}

export function foot(value: string): ScoutingPlayerRow["strong_foot"] {
  return value === "left" || value === "right" || value === "both" ? value : null;
}

export function positions(value: string): string[] {
  return [...new Set(value.split(/[,;/]/).map((part) => normalizeCanonicalPosition(part.trim())).filter((part): part is string => Boolean(part)))];
}

export function playerPayload(form: FormData) {
  const firstName = formText(form, "firstName", 120);
  if (!firstName) throw new Error("First name is required.");
  const birthDate = formText(form, "birthDate", 10);
  const nextActionDate = formText(form, "nextActionDate", 10);
  if (birthDate && !validDate(birthDate)) throw new Error("Check the birthdate.");
  if (nextActionDate && !validDate(nextActionDate)) throw new Error("Check the next action date.");
  const primary = formText(form, "primaryPosition", 40);
  const primaryPosition = primary ? normalizeCanonicalPosition(primary) : null;
  if (primary && !primaryPosition) throw new Error("Choose a valid primary position.");
  const secondary = positions(formText(form, "secondaryPositions", 200)).filter((code) => code !== primaryPosition);
  return {
    first_name: firstName,
    last_name: optional(formText(form, "lastName", 120)),
    date_of_birth: optional(birthDate),
    primary_position: primaryPosition,
    secondary_positions: secondary,
    strong_foot: foot(formText(form, "strongFoot", 20)),
    current_club: optional(formText(form, "currentClub", 160)),
    current_team: optional(formText(form, "currentTeam", 120)),
    status: option<ScoutingPlayerRow["status"]>(formText(form, "status"), ["identified", "monitoring", "shortlist", "trial", "added_to_squad", "archived"], "identified"),
    source: optional(formText(form, "source", 160)),
    priority: option<ScoutingPlayerRow["priority"]>(formText(form, "priority"), ["high", "medium", "low"], "medium"),
    notes: optional(formText(form, "notes")),
    height_cm: optionalNumber(form, "heightCm", 0, 300),
    weight_kg: optionalNumber(form, "weightKg", 0, 500),
    next_action: parseNextAction(formText(form, "nextAction")),
    next_action_date: optional(nextActionDate)
  };
}

function parseNextAction(value: string): ScoutingPlayerRow["next_action"] {
  return value === "observe_again" || value === "contact_club" || value === "invite_to_trial" || value === "discuss" || value === "none" || value === "archive" ? value : null;
}

export function observationPayload(form: FormData) {
  const date = formText(form, "observedOn", 10);
  if (!validDate(date)) throw new Error("Choose a valid observation date.");
  const summary = formText(form, "summary");
  if (!summary) throw new Error("Add a short summary.");
  const minutes = optionalNumber(form, "minutesObserved", 0, 300);
  if (minutes !== null && !Number.isInteger(minutes)) throw new Error("Minutes must be a whole number.");
  const rating = (name: string) => {
    const value = optionalNumber(form, name, 1, 5);
    if (value !== null && !Number.isInteger(value)) throw new Error("Ratings must be whole numbers from 1 to 5.");
    return value;
  };
  return {
    observed_on: date,
    context: option<ScoutingObservationRow["context"]>(formText(form, "context"), ["match", "training", "tournament", "trial", "other"], "match"),
    event_label: optional(formText(form, "eventLabel", 160)),
    observed_position: optional(formText(form, "observedPosition", 60)),
    minutes_observed: minutes,
    observer: optional(formText(form, "observer", 120)),
    strengths: optional(formText(form, "strengths")),
    development_considerations: optional(formText(form, "development")),
    summary,
    next_action: optional(formText(form, "nextAction", 300)),
    rating_technical: rating("ratingTechnical"),
    rating_tactical: rating("ratingTactical"),
    rating_physical: rating("ratingPhysical"),
    rating_mental: rating("ratingMental")
  };
}

export function targetPayload(form: FormData) {
  const title = formText(form, "title", 160);
  if (!title) throw new Error("Target title is required.");
  const from = optionalNumber(form, "birthYearFrom", 1900, 2100);
  const to = optionalNumber(form, "birthYearTo", 1900, 2100);
  if ((from !== null && !Number.isInteger(from)) || (to !== null && !Number.isInteger(to)) || (from !== null && to !== null && from > to)) {
    throw new Error("Check the birth-year range.");
  }
  const targetNumber = optionalNumber(form, "targetNumber", 1, 100);
  if (targetNumber !== null && !Number.isInteger(targetNumber)) throw new Error("Players sought must be a whole number.");
  const deadline = formText(form, "deadline", 10);
  if (deadline && !validDate(deadline)) throw new Error("Check the deadline.");
  return {
    title,
    squad_id: optional(formText(form, "squadId", 36)),
    priority: option<ScoutingTargetRow["priority"]>(formText(form, "priority"), ["high", "medium", "low"], "medium"),
    status: option<ScoutingTargetRow["status"]>(formText(form, "status"), ["active", "paused", "completed", "archived"], "active"),
    positions: positions(formText(form, "positions", 200)),
    birth_year_from: from,
    birth_year_to: to,
    preferred_foot: foot(formText(form, "preferredFoot")),
    desired_profile: optional(formText(form, "desiredProfile")),
    target_number: targetNumber,
    deadline: optional(deadline),
    notes: optional(formText(form, "notes"))
  };
}
