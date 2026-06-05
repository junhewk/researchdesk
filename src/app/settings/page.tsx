import { settingsSections } from "@/workspaces/settings";
import { ProviderSettingsForm } from "@/components/ProviderSettingsForm";

export default function SettingsPage() {
  return (
    <div className="reveal mx-auto max-w-2xl">
      <h1 className="font-display text-[36px] leading-tight tracking-tight font-bold mb-3"
          style={{ letterSpacing: "-0.02em" }}>
        Settings
      </h1>
      <p className="mb-10 text-[14px] text-[color:var(--color-on-surface-variant)]">
        Provider configuration, confidentiality preferences, and data paths.
      </p>

      <div className="space-y-10">
        <ProviderSettingsForm />
        {settingsSections.slice(1).map((section) => (
          <ConfigSection key={section.title} {...section} />
        ))}
      </div>
    </div>
  );
}

function ConfigSection({
  title,
  caption,
  fields,
}: {
  title: string;
  caption: React.ReactNode;
  fields: { label: string; placeholder: string }[];
}) {
  return (
    <section>
      <h2 className="font-display text-[18px] font-semibold tracking-tight mb-1.5">
        {title}
      </h2>
      <p className="text-[13px] text-[color:var(--color-on-surface-variant)] mb-4 leading-relaxed">
        {caption}
      </p>
      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.label}>
            <label className="label block mb-1">{f.label}</label>
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
