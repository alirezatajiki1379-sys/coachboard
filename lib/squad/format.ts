import type { SquadPlayer } from "@/types/domain";

export function playerFullName(player: Pick<SquadPlayer, "firstName" | "lastName">) {
  return [player.firstName, player.lastName].filter(Boolean).join(" ").trim();
}

export function formatPlayerBirthDate(value?: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}
