"use client";

import { useEffect } from "react";
import type { AppLanguage } from "@/server/appLanguage";

const STORAGE_KEY = "reviewer-agent.language";

export function persistClientLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, language);
  window.dispatchEvent(
    new CustomEvent("reviewer-agent:language-change", {
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
