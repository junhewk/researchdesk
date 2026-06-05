"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Globe2, Loader2 } from "lucide-react";
import { persistClientLanguage } from "@/components/LanguageBootstrap";
import type {
  AppLanguage,
  LanguageOption,
  LanguageSettingsPayload,
} from "@/server/appLanguage";

const COPY: Record<AppLanguage, {
  title: string;
  caption: string;
  fieldLabel: string;
  saving: string;
  saved: string;
  error: string;
  loading: string;
}> = {
  en: {
    title: "Language",
    caption: "Choose the app display language. The shell and settings screen update after saving.",
    fieldLabel: "Display language",
    saving: "Saving",
    saved: "Saved",
    error: "Could not save language settings",
    loading: "Loading language settings",
  },
  ko: {
    title: "언어",
    caption: "앱 표시 언어를 선택합니다. 저장하면 앱 shell과 settings 화면에 반영됩니다.",
    fieldLabel: "표시 언어",
    saving: "저장 중",
    saved: "저장됨",
    error: "언어 설정을 저장할 수 없습니다",
    loading: "언어 설정을 불러오는 중",
  },
};

interface LanguageSettingsFormProps {
  initialLanguage: AppLanguage;
}

export function LanguageSettingsForm({
  initialLanguage,
}: LanguageSettingsFormProps) {
  const router = useRouter();
  const [language, setLanguage] = useState<AppLanguage>(initialLanguage);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = COPY[language];

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/settings/language");
        if (!response.ok) {
          throw new Error(`Could not load language settings (${response.status})`);
        }
        const data = (await response.json()) as LanguageSettingsPayload;
        if (cancelled) return;
        setLanguage(data.language);
        setLanguages(data.languages);
        persistClientLanguage(data.language);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : COPY[initialLanguage].error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialLanguage]);

  const saveLanguage = async (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage);
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const response = await fetch("/api/settings/language", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: nextLanguage }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || COPY[nextLanguage].error);
      }
      const payload = data as LanguageSettingsPayload;
      setLanguage(payload.language);
      setLanguages(payload.languages);
      persistClientLanguage(payload.language);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : COPY[nextLanguage].error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-[13px] text-[color:var(--color-on-surface-variant)]">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        {copy.loading}
      </div>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[18px] font-semibold tracking-tight mb-1.5">
            {copy.title}
          </h2>
          <p className="max-w-2xl text-[13px] leading-relaxed text-[color:var(--color-on-surface-variant)]">
            {copy.caption}
          </p>
        </div>
        <div className="flex h-9 items-center gap-2 text-[13px] text-[color:var(--color-on-surface-variant)]">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              {copy.saving}
            </>
          ) : saved ? (
            <>
              <Check className="h-4 w-4 text-[color:var(--color-primary)]" strokeWidth={2} />
              {copy.saved}
            </>
          ) : (
            <Globe2 className="h-4 w-4" strokeWidth={1.75} />
          )}
        </div>
      </div>

      <div className="mt-6">
        <label className="label block mb-1" htmlFor="app-language">
          {copy.fieldLabel}
        </label>
        <select
          id="app-language"
          value={language}
          onChange={(event) => void saveLanguage(event.target.value as AppLanguage)}
          disabled={saving}
          className="w-full max-w-sm rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-3 py-2 text-[13px] text-[color:var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-primary)] disabled:opacity-60"
        >
          {languages.map((option) => (
            <option key={option.code} value={option.code}>
              {option.nativeLabel} / {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-2 text-[12px] text-red-700">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
