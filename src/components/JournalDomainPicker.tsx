"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface JournalDomainPickerProps {
  journalType: string;
  researchDomain: string;
  researchType: string;
  onJournalTypeChange: (value: string) => void;
  onResearchDomainChange: (value: string) => void;
  onResearchTypeChange: (value: string) => void;
}

const RESEARCH_TYPES = [
  "quantitative",
  "qualitative",
  "mixed-methods",
  "theoretical",
  "meta-analysis",
  "systematic-review",
  "case-study",
];

export function JournalDomainPicker({
  journalType,
  researchDomain,
  researchType,
  onJournalTypeChange,
  onResearchDomainChange,
  onResearchTypeChange,
}: JournalDomainPickerProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="journal-type" className="label block mb-1">Target journal</label>
        <input
          id="journal-type"
          value={journalType}
          onChange={(e) => onJournalTypeChange(e.target.value)}
          placeholder="Nature, JAMA…"
          className="w-full bg-transparent border-0 border-b border-[color:var(--color-rule)] py-1 text-[13px] focus:outline-none focus:border-[color:var(--color-ink)] placeholder:italic placeholder:text-[color:var(--color-sepia-light)]"
        />
      </div>
      <div>
        <label htmlFor="research-domain" className="label block mb-1">Research domain</label>
        <input
          id="research-domain"
          value={researchDomain}
          onChange={(e) => onResearchDomainChange(e.target.value)}
          placeholder="Sociology, medicine…"
          className="w-full bg-transparent border-0 border-b border-[color:var(--color-rule)] py-1 text-[13px] focus:outline-none focus:border-[color:var(--color-ink)] placeholder:italic placeholder:text-[color:var(--color-sepia-light)]"
        />
      </div>
      <div>
        <label className="label block mb-1">Research type</label>
        <Select value={researchType} onValueChange={onResearchTypeChange}>
          <SelectTrigger className="rounded-none border-0 border-b border-[color:var(--color-rule)] bg-transparent h-8 text-[13px] px-0">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {RESEARCH_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t.replace("-", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
