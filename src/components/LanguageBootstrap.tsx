"use client";

import { useEffect } from "react";
import type { AppLanguage } from "@/server/appLanguage";

const STORAGE_KEY = "researchdesk.language";
const LEGACY_STORAGE_KEY = "reviewer-agent.language";
const LANGUAGE_CHANGE_EVENT = "researchdesk:language-change";
const LEGACY_LANGUAGE_CHANGE_EVENT = "reviewer-agent:language-change";

export function persistClientLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.localStorage.setItem(STORAGE_KEY, language);
  window.dispatchEvent(
    new CustomEvent(LANGUAGE_CHANGE_EVENT, {
      detail: { language },
    }),
  );
  window.dispatchEvent(
    new CustomEvent(LEGACY_LANGUAGE_CHANGE_EVENT, {
      detail: { language },
    }),
  );
  document.documentElement.lang = language;
}

export function LanguageBootstrap({
  language,
}: {
  language: AppLanguage;
}) {
  useEffect(() => {
    persistClientLanguage(language);
  }, [language]);

  return null;
}
