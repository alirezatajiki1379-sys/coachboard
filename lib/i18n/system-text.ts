import { germanUiDictionary, germanUiPatterns } from "@/lib/i18n/german-ui-dictionary";
import { formatMessage, type Locale } from "@/lib/i18n";

// Only pass CoachBoard-owned copy here, never player names, notes or custom titles.
export function systemText(locale: Locale, source: string, values: Record<string, string | number> = {}) {
  let translated = source;
  if (locale === "de") {
    const key = source.trim();
    const direct = germanUiDictionary[key];
    if (direct) translated = source.replace(key, direct);
    else {
      for (const [pattern, render] of germanUiPatterns) {
        const match = key.match(pattern);
        if (match) {
          translated = source.replace(key, render(match));
          break;
        }
      }
    }
  }
  return formatMessage(translated, values);
}

export function createSystemTranslator(locale: Locale) {
  return (source: string, values?: Record<string, string | number>) => systemText(locale, source, values);
}
