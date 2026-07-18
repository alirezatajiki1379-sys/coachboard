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

export function formatLongDate(value?: string) {
  if (!value) return "";
  const date = parseDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

export function calculateAge(dateOfBirth?: string, today = new Date()) {
  const birthDate = parseDate(dateOfBirth);
  if (!birthDate) return undefined;
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayThisYear = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  if (today < birthdayThisYear) age -= 1;
  return age >= 0 ? age : undefined;
}

function parseDate(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}
