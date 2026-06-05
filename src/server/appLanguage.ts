import { getDb } from "./db";

export const appLanguages = ["en", "ko"] as const;

export type AppLanguage = (typeof appLanguages)[number];

export interface LanguageOption {
  code: AppLanguage;
  label: string;
  nativeLabel: string;
}

export interface LanguageSettingsPayload {
  language: AppLanguage;
  languages: LanguageOption[];
}

const LANGUAGE_SETTING_KEY = "app_language";
const languageSet = new Set<string>(appLanguages);

export const languageOptions: LanguageOption[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
];

export function isAppLanguage(
  value: string | null | undefined,
): value is AppLanguage {
  return Boolean(value && languageSet.has(value));
}

export function getAppLanguage(): AppLanguage {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(LANGUAGE_SETTING_KEY) as { value: string | null } | undefined;

  return isAppLanguage(row?.value) ? row.value : "en";
}

export function setAppLanguage(language: AppLanguage): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(LANGUAGE_SETTING_KEY, language);
}

export function getLanguageSettings(): LanguageSettingsPayload {
  return {
    language: getAppLanguage(),
    languages: languageOptions,
  };
}
