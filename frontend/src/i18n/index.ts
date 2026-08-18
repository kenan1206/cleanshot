import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import { storage } from "@/src/utils/storage";

import en from "./locales/en.json";
import de from "./locales/de.json";
import tr from "./locales/tr.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";
import pt from "./locales/pt.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import ru from "./locales/ru.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const LANG_STORAGE_KEY = "cleanu.language";

const resources = {
  en: { translation: en },
  de: { translation: de },
  tr: { translation: tr },
  es: { translation: es },
  fr: { translation: fr },
  it: { translation: it },
  pt: { translation: pt },
  nl: { translation: nl },
  pl: { translation: pl },
  ru: { translation: ru },
};

function detectDeviceLanguage(): LanguageCode {
  try {
    const locales = Localization.getLocales();
    for (const l of locales) {
      const code = (l.languageCode ?? "").toLowerCase();
      if (SUPPORTED_LANGUAGES.some((x) => x.code === code)) return code as LanguageCode;
    }
  } catch {
    // ignore
  }
  return "en";
}

export async function initI18n(): Promise<void> {
  const stored = await storage.getItem<string>(LANG_STORAGE_KEY, "");
  const initial: LanguageCode = (SUPPORTED_LANGUAGES.some((x) => x.code === stored)
    ? (stored as LanguageCode)
    : detectDeviceLanguage());

  await i18n.use(initReactI18next).init({
    resources,
    lng: initial,
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export async function setLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code);
  await storage.setItem(LANG_STORAGE_KEY, code);
}

export function currentLanguage(): LanguageCode {
  const c = (i18n.language || "en").split("-")[0];
  return (SUPPORTED_LANGUAGES.some((x) => x.code === c) ? c : "en") as LanguageCode;
}

export default i18n;
