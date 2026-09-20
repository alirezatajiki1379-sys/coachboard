"use client";

import { useOptionalI18n } from "@/components/i18n/i18n-provider";
import { createSystemTranslator } from "@/lib/i18n/system-text";

export function useSystemText() {
  return createSystemTranslator(useOptionalI18n()?.locale ?? "en");
}
