import deMessages from "@/messages/de.json";
import enMessages from "@/messages/en.json";

export const supportedLocales = ["en", "de"] as const;
export type Locale = (typeof supportedLocales)[number];
export type Messages = typeof enMessages;

export const defaultLocale: Locale = "en";

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  if (!normalized) return null;
  const language = normalized.split("-")[0];
  if (language === "de") return "de";
  if (language === "en") return "en";
  return null;
}

export function resolveLocale(preferredLanguage: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  return normalizeLocale(preferredLanguage) ?? localeFromAcceptLanguage(acceptLanguage) ?? defaultLocale;
}

export function localeFromAcceptLanguage(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const entries = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, quality] = part.trim().split(";q=");
      const q = quality ? Number.parseFloat(quality) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0 };
    })
    .sort((a, b) => b.q - a.q);

  for (const entry of entries) {
    const locale = normalizeLocale(entry.tag);
    if (locale) return locale;
  }
  return null;
}

export function getMessages(locale: Locale): Messages {
  return locale === "de" ? deMessages : enMessages;
}

export function formatMessage(template: string, values: Record<string, string | number | null | undefined> = {}) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => String(values[key] ?? ""));
}

export function localeToIntl(locale: Locale) {
  return locale === "de" ? "de-DE" : "en-GB";
}

export function formatDate(value: string | Date | null | undefined, locale: Locale, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeToIntl(locale), options ?? { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(localeToIntl(locale), options).format(value);
}
