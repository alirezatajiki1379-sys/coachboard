import type { ScoutingObservationRow, ScoutingPlayerRow } from "@/types/database";

export const observationRecommendations = ["monitoring", "shortlist", "trial", "identified", "archived"] as const;

type Identity = Pick<ScoutingPlayerRow, "first_name" | "last_name" | "date_of_birth" | "current_club"> & { birth_year?: number | null };
const normalize = (value?: string | null) => (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("de").replace(/\s+/g, " ");

export function possibleScoutingDuplicate(a: Identity, b: Identity) {
  if (normalize(a.first_name) !== normalize(b.first_name) || normalize(a.last_name) !== normalize(b.last_name)) return false;
  if (a.date_of_birth && b.date_of_birth) return a.date_of_birth === b.date_of_birth;
  const yearA = a.date_of_birth ? Number(a.date_of_birth.slice(0, 4)) : a.birth_year;
  const yearB = b.date_of_birth ? Number(b.date_of_birth.slice(0, 4)) : b.birth_year;
  if (yearA && yearB) return yearA === yearB;
  return Boolean(a.current_club && b.current_club && normalize(a.current_club) === normalize(b.current_club));
}

export type ObservationFollowUp = Pick<ScoutingObservationRow, "next_action" | "follow_up_date">;

// Only the latest dated observation supplies an observation follow-up. Clearing
// it must not resurrect an older task; the independent player-level action stays.
export function scoutingFollowUpDate(player: Pick<ScoutingPlayerRow, "status" | "next_action" | "next_action_date">, observation?: ObservationFollowUp) {
  if (player.status === "archived" || player.status === "added_to_squad") return null;
  const dates = [
    player.next_action && player.next_action !== "none" ? player.next_action_date : null,
    observation?.follow_up_date
  ].filter((date): date is string => Boolean(date));
  return dates.sort()[0] ?? null;
}
