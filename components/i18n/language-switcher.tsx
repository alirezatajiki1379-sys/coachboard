import { updatePreferredLanguage } from "@/lib/i18n/actions";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  locale: Locale;
  returnTo?: string;
};

export function LanguageSwitcher({ locale, returnTo = "/settings" }: LanguageSwitcherProps) {
  const messages = getMessages(locale);
  const languageNames = {
    en: messages.settings.language.english,
    de: messages.settings.language.german
  };

  return (
    <form action={updatePreferredLanguage} className="space-y-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      <p className="text-sm text-slate-600">
        {formatMessage(messages.settings.language.current, { language: languageNames[locale] })}
      </p>
      <div className="flex flex-wrap gap-2">
        {(["en", "de"] as const).map((option) => (
          <button
            key={option}
            type="submit"
            name="locale"
            value={option}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-board-green",
              option === locale
                ? "border-board-green bg-board-green text-white"
                : "border-board-line bg-white text-board-navy hover:border-board-green/50 hover:bg-green-50"
            )}
          >
            {languageNames[option]}
          </button>
        ))}
      </div>
    </form>
  );
}
