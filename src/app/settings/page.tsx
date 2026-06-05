import { settingsSections } from "@/workspaces/settings";
import { getAppLanguage, type AppLanguage } from "@/server/appLanguage";
import { LanguageSettingsForm } from "@/components/LanguageSettingsForm";
import { ProviderSettingsForm } from "@/components/ProviderSettingsForm";

const SETTINGS_COPY: Record<AppLanguage, {
  title: string;
  caption: string;
  sections: Record<string, {
    title: string;
    caption: string;
    fields: Record<string, string>;
  }>;
}> = {
  en: {
    title: "Settings",
    caption: "Provider configuration, language, confidentiality preferences, and data paths.",
    sections: {
      "Scholarly search": {
        title: "Scholarly search",
        caption: "Semantic Scholar + OpenAlex for citation and evidence checks.",
        fields: {
          "Semantic Scholar key": "Semantic Scholar key",
          "OpenAlex email": "OpenAlex email",
        },
      },
      Data: {
        title: "Data",
        caption: "SQLite database and markdown exports.",
        fields: {
          "Data directory": "Data directory",
        },
      },
    },
  },
  ko: {
    title: "설정",
    caption: "API 제공자, 언어, 보안 선호 사항, 데이터 경로를 설정합니다.",
    sections: {
      "Scholarly search": {
        title: "학술 검색",
        caption: "인용과 근거 확인에 Semantic Scholar와 OpenAlex를 사용합니다.",
        fields: {
          "Semantic Scholar key": "Semantic Scholar 키",
          "OpenAlex email": "OpenAlex 이메일",
        },
      },
      Data: {
        title: "데이터",
        caption: "SQLite 데이터베이스와 markdown export 위치입니다.",
        fields: {
          "Data directory": "데이터 디렉터리",
        },
      },
    },
  },
};

export default function SettingsPage() {
  const language = getAppLanguage();
  const copy = SETTINGS_COPY[language];

  return (
    <div className="reveal mx-auto max-w-2xl">
      <h1 className="font-display text-[36px] leading-tight tracking-tight font-bold mb-3"
          style={{ letterSpacing: "-0.02em" }}>
        {copy.title}
      </h1>
      <p className="mb-10 text-[14px] text-[color:var(--color-on-surface-variant)]">
        {copy.caption}
      </p>

      <div className="space-y-10">
        <LanguageSettingsForm initialLanguage={language} />
        <ProviderSettingsForm language={language} />
        {settingsSections.slice(1).map((section) => (
          <ConfigSection
            key={section.title}
            section={section}
            sectionCopy={copy.sections[section.title]}
          />
        ))}
      </div>
    </div>
  );
}

function ConfigSection({
  section,
  sectionCopy,
}: {
  section: {
    title: string;
    caption: React.ReactNode;
    fields: { label: string; placeholder: string }[];
  };
  sectionCopy?: {
    title: string;
    caption: string;
    fields: Record<string, string>;
  };
}) {
  return (
    <section>
      <h2 className="font-display text-[18px] font-semibold tracking-tight mb-1.5">
        {sectionCopy?.title ?? section.title}
      </h2>
      <p className="text-[13px] text-[color:var(--color-on-surface-variant)] mb-4 leading-relaxed">
        {sectionCopy?.caption ?? section.caption}
      </p>
      <div className="space-y-4">
        {section.fields.map((f) => (
          <div key={f.label}>
            <label className="label block mb-1">
              {sectionCopy?.fields[f.label] ?? f.label}
            </label>
            <input
              readOnly
              placeholder={f.placeholder}
              className="w-full bg-transparent border-0 border-b border-[color:var(--color-rule)] py-1 text-[13px] focus:outline-none placeholder:italic placeholder:text-[color:var(--color-sepia-light)]"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
