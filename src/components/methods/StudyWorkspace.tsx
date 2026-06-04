"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SessionStream } from "@/components/SessionStream";
import {
  DECISION_STATE_STYLES,
  DECISION_STATE_LABEL,
  PREFLIGHT_SEVERITY_STYLES,
  EVIDENCE_KIND_LABEL,
} from "@/lib/styles";
import type { Provider, Study } from "@/server/types";

type LocalProvider = Extract<Provider, "ollama" | "lmstudio" | "llama_server">;

const LOCAL_PROVIDER_STORAGE_KEY = "reviewer.methods.localProvider";
const LOCAL_PROVIDER_OPTIONS: { value: LocalProvider; label: string }[] = [
  { value: "ollama", label: "Ollama" },
  { value: "lmstudio", label: "LM Studio" },
  { value: "llama_server", label: "llama-server" },
];

function isLocalProvider(value: string | null): value is LocalProvider {
  return LOCAL_PROVIDER_OPTIONS.some((option) => option.value === value);
}

interface StreamTarget {
  id: string;
  title: string;
  cardType?: string;
}
interface EvidenceView {
  id: string;
  kind: string;
  label: string;
  detail_md: string | null;
}
interface CardField {
  id: string;
  label: string;
}
interface CardView {
  id: string;
  card_type: string;
  label: string;
  stage: string;
  help: string;
  requiredFields: CardField[];
  dependsOn: string[];
  evidenceKinds: string[];
  state: string;
  stale: boolean;
  position: number;
  value: { value?: string; fields?: Record<string, string> };
  open_question_md: string | null;
  evidence: EvidenceView[];
}
interface Finding {
  layer: string;
  severity: string;
  card_type: string | null;
  title: string;
  detail_md?: string;
}
interface RiskFinding {
  id: string;
  severity: string;
  card_type: string | null;
  title: string;
  detail_md: string | null;
}
interface Inspector {
  findings: Finding[];
  riskFindings: RiskFinding[];
  mapping: { guideline: string; ready: number; total: number }[];
  readyPct: number;
  staleCards: string[];
  nextBestAction: string | null;
  nextBestActionCard: string | null;
  blockingCount: number;
  importantCount: number;
}
interface ArtifactSummary {
  kind: string;
  title: string;
  ready_pct: number;
  section_count: number;
  has_override: boolean;
}
interface LogEntry {
  id: string;
  card_type: string | null;
  action: string;
  decision_md: string | null;
  reason_md: string | null;
  created_at: number;
}

const READY = new Set([
  "drafted",
  "evidence_supported",
  "locked",
  "assumed",
]);
const isReady = (s: string) => READY.has(s);

async function patch(url: string, body: unknown) {
  return fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function post(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function loadAll(base: string) {
  const [c, e, p, a, l] = await Promise.all([
    fetch(`${base}/cards`).then((r) => r.json()),
    fetch(`${base}/evidence`).then((r) => r.json()),
    fetch(`${base}/preflight`).then((r) => r.json()),
    fetch(`${base}/artifacts`).then((r) => r.json()),
    fetch(`${base}/decision-log`).then((r) => r.json()),
  ]);
  return {
    cards: (c.cards ?? []) as CardView[],
    grouped: (e.grouped ?? {}) as Record<string, EvidenceView[]>,
    inspector: (p ?? null) as Inspector | null,
    artifacts: (a ?? []) as ArtifactSummary[],
    log: (l ?? []) as LogEntry[],
  };
}

export function StudyWorkspace({
  studyId,
  initialStudy,
}: {
  studyId: string;
  initialStudy: Study;
}) {
  const [study] = useState<Study>(initialStudy);
  const [cards, setCards] = useState<CardView[]>([]);
  const [grouped, setGrouped] = useState<Record<string, EvidenceView[]>>({});
  const [inspector, setInspector] = useState<Inspector | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [stream, setStream] = useState<StreamTarget | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pending, setPending] = useState<{ cardType: string; value: string } | null>(null);
  const [localProvider, setLocalProvider] = useState<LocalProvider | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem(LOCAL_PROVIDER_STORAGE_KEY);
      return isLocalProvider(stored) ? stored : null;
    } catch {
      return null;
    }
  });
  const initialized = useRef(false);

  const base = `/api/studies/${studyId}`;
  const requiresLocalProvider = study.confidentiality_mode === "local_only";

  const chooseLocalProvider = useCallback((provider: LocalProvider) => {
    setLocalProvider(provider);
    try {
      window.localStorage.setItem(LOCAL_PROVIDER_STORAGE_KEY, provider);
    } catch {
      /* ignore */
    }
  }, []);

  const apply = useCallback((d: Awaited<ReturnType<typeof loadAll>>) => {
    setCards(d.cards);
    setGrouped(d.grouped);
    setInspector(d.inspector);
    setArtifacts(d.artifacts);
    setLog(d.log);
    // Initialize expansion once: collapse everything to show the stage overview,
    // open just the next-best-action card so there's an obvious starting point.
    if (!initialized.current && d.cards.length) {
      initialized.current = true;
      const first = d.inspector?.nextBestActionCard;
      setExpanded(new Set(first ? [first] : []));
    }
  }, []);

  const refresh = useCallback(async () => {
    apply(await loadAll(base));
  }, [base, apply]);

  useEffect(() => {
    let active = true;
    loadAll(base).then((d) => active && apply(d));
    return () => {
      active = false;
    };
  }, [base, apply]);

  const scrollToCard = useCallback((cardType: string, alsoExpand = true) => {
    if (alsoExpand) setExpanded((s) => new Set(s).add(cardType));
    setHighlight(cardType);
    setTimeout(() => {
      document
        .getElementById(`card-${cardType}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    setTimeout(() => setHighlight((h) => (h === cardType ? null : h)), 2200);
  }, []);

  const toggleCard = useCallback((cardType: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(cardType)) n.delete(cardType);
      else n.add(cardType);
      return n;
    });
  }, []);

  async function linkEvidenceTo(cardType: string, evidenceItemId: string) {
    await post(`${base}/cards/${cardType}/evidence`, { evidence_item_id: evidenceItemId });
    scrollToCard(cardType);
    refresh();
  }

  function useProposal(cardType: string, value: string) {
    setStream(null);
    setPending({ cardType, value });
    scrollToCard(cardType);
  }

  return (
    <div className="reveal">
      <Header
        study={study}
        inspector={inspector}
        localProvider={localProvider}
        onLocalProviderChange={chooseLocalProvider}
        onJumpNext={() =>
          inspector?.nextBestActionCard && scrollToCard(inspector.nextBestActionCard)
        }
      />
      <ProgressRail cards={cards} onJump={(card) => scrollToCard(card)} />

      <div className="grid grid-cols-[250px_1fr_290px] gap-6 mt-5 items-start">
        <EvidenceTray
          grouped={grouped}
          cards={cards}
          onImport={() => setImporting(true)}
          onAddToCard={linkEvidenceTo}
        />
        <Canvas
          base={base}
          cards={cards}
          inspector={inspector}
          expanded={expanded}
          highlight={highlight}
          pending={pending}
          requiresLocalProvider={requiresLocalProvider}
          localProvider={localProvider}
          onToggle={toggleCard}
          onChange={refresh}
          onStream={setStream}
          setNotice={setNotice}
          onPendingApplied={() => setPending(null)}
        />
        <InspectorPanel
          base={base}
          inspector={inspector}
          cards={cards}
          requiresLocalProvider={requiresLocalProvider}
          localProvider={localProvider}
          setNotice={setNotice}
          onStream={setStream}
          onJump={(card) => scrollToCard(card)}
        />
      </div>

      {notice && (
        <div className="mt-4 px-3 py-2 text-[12px] border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)]">
          {notice}
        </div>
      )}

      <ArtifactBar studyId={studyId} base={base} artifacts={artifacts} />
      <DecisionLog log={log} />

      {importing && (
        <ImportModal
          base={base}
          onClose={() => setImporting(false)}
          onStream={setStream}
          onDone={(msg) => {
            setImporting(false);
            setNotice(msg);
            refresh();
          }}
        />
      )}

      {stream && (
        <StreamModal
          base={base}
          target={stream}
          onClose={() => {
            setStream(null);
            refresh();
          }}
          onTurnComplete={refresh}
          onUseProposal={useProposal}
        />
      )}
    </div>
  );
}

function Header({
  study,
  inspector,
  localProvider,
  onLocalProviderChange,
  onJumpNext,
}: {
  study: Study;
  inspector: Inspector | null;
  localProvider: LocalProvider | null;
  onLocalProviderChange: (provider: LocalProvider) => void;
  onJumpNext: () => void;
}) {
  const MODE_LABEL: Record<string, string> = {
    systematic_review: "Systematic review",
    retrospective_observational: "Retrospective observational",
    interventional: "AI-intervention trial",
  };
  return (
    <div className="border-b-2 border-[color:var(--color-ink)] pb-3 sticky top-0 z-30 bg-[color:var(--color-surface)]">
      <div className="flex items-baseline justify-between">
        <Link
          href="/methods"
          className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
        >
          ← Methods Workbench
        </Link>
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wide">
          <span className="text-[color:var(--color-on-surface-variant)]">
            {MODE_LABEL[study.mode] ?? study.mode}
          </span>
          {study.confidentiality_mode === "local_only" && (
            <span className="px-2 py-0.5 border border-[color:var(--color-tertiary)] text-[color:var(--color-tertiary)]">
              local-only
            </span>
          )}
          {study.confidentiality_mode === "local_only" && (
            <LocalProviderPicker
              value={localProvider}
              onChange={onLocalProviderChange}
            />
          )}
          <span className="px-2 py-0.5 border border-[color:var(--color-ink)]">
            {inspector?.readyPct ?? 0}% ready
          </span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1
            className="font-display text-[28px] leading-tight mt-2"
            style={{ fontVariationSettings: "'opsz' 48, 'wght' 420" }}
          >
            {study.title}
          </h1>
          {study.research_question && (
            <p className="mt-1 text-[13px] italic font-display text-[color:var(--color-on-surface-variant)]">
              {study.research_question}
            </p>
          )}
        </div>
        {inspector?.nextBestAction && (
          <button
            onClick={onJumpNext}
            className="shrink-0 mb-1 px-3 py-1.5 text-[12px] border border-[color:var(--color-primary)] text-[color:var(--color-primary)] hover:bg-[color:var(--color-primary)] hover:text-[color:var(--color-on-primary)] transition-colors"
          >
            Next: {inspector.nextBestAction} →
          </button>
        )}
      </div>
    </div>
  );
}

function LocalProviderPicker({
  value,
  onChange,
}: {
  value: LocalProvider | null;
  onChange: (provider: LocalProvider) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-[color:var(--color-on-surface-variant)]">
        Local provider
      </span>
      <div className="inline-flex border border-[color:var(--color-outline-variant)]">
        {LOCAL_PROVIDER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-2 py-0.5 transition-colors ${
              value === option.value
                ? "bg-[color:var(--color-ink)] text-[color:var(--color-paper)]"
                : "text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProgressRail({
  cards,
  onJump,
}: {
  cards: CardView[];
  onJump: (firstCard: string) => void;
}) {
  const stages = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, CardView[]>();
    for (const c of cards) {
      if (!map.has(c.stage)) {
        map.set(c.stage, []);
        order.push(c.stage);
      }
      map.get(c.stage)!.push(c);
    }
    return order.map((label) => {
      const cs = map.get(label)!;
      const ready = cs.filter((c) => isReady(c.state)).length;
      return { label, ready, total: cs.length, first: cs[0]?.card_type };
    });
  }, [cards]);

  if (stages.length === 0) return null;
  return (
    <div className="flex items-stretch gap-1 mt-4">
      {stages.map((s) => {
        const pct = s.total ? Math.round((s.ready / s.total) * 100) : 0;
        return (
          <button
            key={s.label}
            onClick={() => s.first && onJump(s.first)}
            className="flex-1 text-left group"
            title={`${s.ready}/${s.total} ready`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] group-hover:text-[color:var(--color-redink)] truncate">
                {s.label}
              </span>
              <span className="text-[10px] font-mono tabular text-[color:var(--color-on-surface-variant)]">
                {s.ready}/{s.total}
              </span>
            </div>
            <div className="mt-1 h-1 bg-[color:var(--color-outline-variant)]">
              <div
                className="h-1 bg-[color:var(--color-primary)]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EvidenceTray({
  grouped,
  cards,
  onImport,
  onAddToCard,
}: {
  grouped: Record<string, EvidenceView[]>;
  cards: CardView[];
  onImport: () => void;
  onAddToCard: (cardType: string, evidenceItemId: string) => void;
}) {
  const kinds = Object.keys(grouped);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  function targetsFor(kind: string) {
    return cards.filter((c) => c.evidenceKinds.includes(kind));
  }

  return (
    <aside className="border-r border-[color:var(--color-outline-variant)] pr-4 min-h-[400px]">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="label">Evidence</h2>
        <button
          onClick={onImport}
          className="text-[11px] text-[color:var(--color-ink)] hover:text-[color:var(--color-redink)]"
        >
          + Import
        </button>
      </div>
      {kinds.length === 0 ? (
        <p className="text-[12px] text-[color:var(--color-on-surface-variant)] italic">
          No evidence yet. Import an MDR or RW snapshot to populate design-relevant
          items, then drag them onto cards or use the + menu.
        </p>
      ) : (
        <div className="space-y-4">
          {kinds.map((kind) => (
            <div key={kind}>
              <div className="text-[10px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] mb-1">
                {EVIDENCE_KIND_LABEL[kind] ?? kind}
              </div>
              <div className="space-y-1">
                {grouped[kind].map((item) => (
                  <div key={item.id} className="relative">
                    <div
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
                      title={item.detail_md ?? undefined}
                      className="flex items-start gap-1 px-2 py-1 text-[12px] border border-[color:var(--color-outline-variant)] rounded cursor-grab hover:border-[color:var(--color-primary)] bg-[color:var(--color-surface-container-low)]"
                    >
                      <span className="flex-1">{item.label}</span>
                      <button
                        onClick={() =>
                          setMenuFor(menuFor === item.id ? null : item.id)
                        }
                        className="shrink-0 text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)] font-mono"
                        title="Add to a card"
                      >
                        ＋
                      </button>
                    </div>
                    {menuFor === item.id && (
                      <div className="absolute z-40 left-2 mt-0.5 w-[200px] border border-[color:var(--color-ink)] bg-[color:var(--color-surface)] shadow">
                        <div className="px-2 py-1 text-[10px] font-mono uppercase text-[color:var(--color-on-surface-variant)] border-b border-[color:var(--color-outline-variant)]">
                          Add to card
                        </div>
                        {targetsFor(item.kind).length === 0 ? (
                          <div className="px-2 py-1 text-[11px] italic text-[color:var(--color-on-surface-variant)]">
                            no matching card
                          </div>
                        ) : (
                          targetsFor(item.kind).map((c) => (
                            <button
                              key={c.card_type}
                              onClick={() => {
                                setMenuFor(null);
                                onAddToCard(c.card_type, item.id);
                              }}
                              className="block w-full text-left px-2 py-1 text-[12px] hover:bg-[color:var(--color-surface-container-low)]"
                            >
                              {c.label}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function Canvas({
  base,
  cards,
  inspector,
  expanded,
  highlight,
  pending,
  requiresLocalProvider,
  localProvider,
  onToggle,
  onChange,
  onStream,
  setNotice,
  onPendingApplied,
}: {
  base: string;
  cards: CardView[];
  inspector: Inspector | null;
  expanded: Set<string>;
  highlight: string | null;
  pending: { cardType: string; value: string } | null;
  requiresLocalProvider: boolean;
  localProvider: LocalProvider | null;
  onToggle: (cardType: string) => void;
  onChange: () => void;
  onStream: (s: StreamTarget) => void;
  setNotice: (s: string | null) => void;
  onPendingApplied: () => void;
}) {
  const conflictCards = new Set(
    (inspector?.findings ?? [])
      .filter((f) => f.layer === "consistency" && f.card_type)
      .map((f) => f.card_type as string),
  );

  // Group by stage, preserving order.
  const stages: { label: string; cards: CardView[] }[] = [];
  for (const c of cards) {
    let g = stages.find((s) => s.label === c.stage);
    if (!g) {
      g = { label: c.stage, cards: [] };
      stages.push(g);
    }
    g.cards.push(c);
  }

  return (
    <section className="space-y-5 max-h-[72vh] overflow-y-auto pr-1">
      {stages.map((stage) => {
        const ready = stage.cards.filter((c) => isReady(c.state)).length;
        return (
          <div key={stage.label}>
            <div className="flex items-baseline gap-2 mb-2 sticky top-0 bg-[color:var(--color-surface)] py-1 z-10">
              <h2 className="label">{stage.label}</h2>
              <span className="text-[10px] font-mono text-[color:var(--color-on-surface-variant)]">
                {ready}/{stage.cards.length}
              </span>
              <div className="flex-1 border-t border-[color:var(--color-outline-variant)] ml-2" />
            </div>
            <div className="space-y-2">
              {stage.cards.map((card) => (
                <CardItem
                  key={card.id}
                  base={base}
                  card={card}
                  conflict={conflictCards.has(card.card_type)}
                  open={expanded.has(card.card_type)}
                  highlighted={highlight === card.card_type}
                  pendingValue={
                    pending?.cardType === card.card_type ? pending.value : null
                  }
                  requiresLocalProvider={requiresLocalProvider}
                  localProvider={localProvider}
                  onToggle={() => onToggle(card.card_type)}
                  onChange={onChange}
                  onStream={onStream}
                  setNotice={setNotice}
                  onPendingApplied={onPendingApplied}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function CardItem({
  base,
  card,
  conflict,
  open,
  highlighted,
  pendingValue,
  requiresLocalProvider,
  localProvider,
  onToggle,
  onChange,
  onStream,
  setNotice,
  onPendingApplied,
}: {
  base: string;
  card: CardView;
  conflict: boolean;
  open: boolean;
  highlighted: boolean;
  pendingValue: string | null;
  requiresLocalProvider: boolean;
  localProvider: LocalProvider | null;
  onToggle: () => void;
  onChange: () => void;
  onStream: (s: StreamTarget) => void;
  setNotice: (s: string | null) => void;
  onPendingApplied: () => void;
}) {
  const [value, setValue] = useState(card.value.value ?? "");
  const [fields, setFields] = useState<Record<string, string>>(card.value.fields ?? {});
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(card.value.value ?? "");
    setFields(card.value.fields ?? {});
    setDirty(false);
  }, [card.id, card.value.value, card.value.fields]);

  // Apply an agent proposal's "Use this" pre-fill (unsaved).
  useEffect(() => {
    if (pendingValue != null) {
      setValue(pendingValue);
      setDirty(true);
      onPendingApplied();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingValue]);

  async function save() {
    if (!dirty) return;
    setSaving(true);
    await patch(`${base}/cards/${card.card_type}`, { value, fields });
    setSaving(false);
    setDirty(false);
    onChange();
  }
  async function setState(state: string, open_question_md?: string) {
    await patch(`${base}/cards/${card.card_type}`, { state, open_question_md });
    onChange();
  }
  async function dropEvidence(itemId: string) {
    await post(`${base}/cards/${card.card_type}/evidence`, { evidence_item_id: itemId });
    onChange();
  }
  async function propose() {
    if (requiresLocalProvider && !localProvider) {
      setNotice("Choose a local provider before starting an agent pass.");
      return;
    }
    const r = await post(
      `${base}/cards/${card.card_type}/propose`,
      requiresLocalProvider ? { provider: localProvider } : {},
    );
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.session_id) {
      setNotice(null);
      onStream({ id: j.session_id, title: `Proposals — ${card.label}`, cardType: card.card_type });
    } else {
      setNotice(`Could not start proposals: ${j.error ?? "no provider"}`);
    }
  }

  const stateStyle = DECISION_STATE_STYLES[card.state] ?? DECISION_STATE_STYLES.not_started;

  return (
    <div
      id={`card-${card.card_type}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) dropEvidence(id);
      }}
      className={`border rounded transition-colors ${
        dragOver
          ? "border-[color:var(--color-primary)] bg-[color:var(--color-surface-container-low)]"
          : highlighted
            ? "border-[color:var(--color-redink)] ring-1 ring-[color:var(--color-redink)]"
            : conflict
              ? "border-[color:var(--color-error)]"
              : "border-[color:var(--color-outline-variant)]"
      }`}
    >
      {/* Header row — click to expand/collapse */}
      <button
        onClick={onToggle}
        className="w-full flex items-baseline gap-2 p-3 text-left"
      >
        <span className="text-[10px] text-[color:var(--color-on-surface-variant)] font-mono">
          {open ? "▾" : "▸"}
        </span>
        <h3 className="font-display text-[16px] flex-1">{card.label}</h3>
        {card.stale && (
          <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase border border-[color:var(--color-tertiary)] text-[color:var(--color-tertiary)]">
            re-check
          </span>
        )}
        <span className={`px-1.5 py-0.5 text-[9px] font-mono uppercase border ${stateStyle}`}>
          {DECISION_STATE_LABEL[card.state] ?? card.state}
        </span>
      </button>

      {/* Collapsed summary */}
      {!open && (
        <div className="px-3 pb-2 -mt-1 pl-7 text-[12px] text-[color:var(--color-on-surface-variant)] truncate">
          {card.value.value ? card.value.value : <span className="italic">{card.help}</span>}
        </div>
      )}

      {/* Expanded inline editor */}
      {open && (
        <div className="px-3 pb-3 pl-7 space-y-2">
          <textarea
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setDirty(true);
            }}
            onBlur={save}
            rows={2}
            placeholder={card.help}
            className="w-full bg-transparent border border-[color:var(--color-outline-variant)] rounded p-2 text-[13px] focus:outline-none focus:border-[color:var(--color-primary)]"
          />
          {card.requiredFields.map((f) => (
            <div key={f.id} className="flex items-center gap-2">
              <span className="w-[34%] shrink-0 text-[11px] text-[color:var(--color-on-surface-variant)]">
                {f.label}
              </span>
              <input
                value={fields[f.id] ?? ""}
                onChange={(e) => {
                  setFields((p) => ({ ...p, [f.id]: e.target.value }));
                  setDirty(true);
                }}
                onBlur={save}
                className="flex-1 bg-transparent border-b border-[color:var(--color-outline-variant)] py-1 text-[12px] focus:outline-none focus:border-[color:var(--color-primary)]"
              />
            </div>
          ))}
          {card.evidence.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {card.evidence.map((ev) => (
                <span
                  key={ev.id}
                  className="px-1.5 py-0.5 text-[10px] border border-[color:var(--color-on-secondary-container)] text-[color:var(--color-on-secondary-container)] rounded"
                >
                  {ev.label}
                </span>
              ))}
            </div>
          )}
          {card.open_question_md && (
            <p className="text-[11px] text-[color:var(--color-tertiary)]">
              ? {card.open_question_md}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[11px] pt-1">
            <span className="font-mono text-[10px] text-[color:var(--color-on-surface-variant)]">
              {saving ? "saving…" : dirty ? "unsaved" : "autosaves"}
            </span>
            {dirty && (
              <>
                <span className="text-[color:var(--color-outline-variant)]">·</span>
                <button onClick={save} className="hover:text-[color:var(--color-redink)]">
                  Save
                </button>
              </>
            )}
            <span className="text-[color:var(--color-outline-variant)]">·</span>
            <button onClick={propose} className="hover:text-[color:var(--color-redink)]">
              Propose options
            </button>
            <button
              onClick={() => {
                const q = prompt("What's the open question? (marks needs-input)");
                if (q) setState("needs_input", q);
              }}
              className="hover:text-[color:var(--color-redink)]"
            >
              Mark unknown
            </button>
            {card.state !== "locked" ? (
              <button onClick={() => setState("locked")} className="hover:text-[color:var(--color-redink)]">
                Lock
              </button>
            ) : (
              <button onClick={() => setState("drafted")} className="hover:text-[color:var(--color-redink)]">
                Unlock
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InspectorPanel({
  base,
  inspector,
  cards,
  requiresLocalProvider,
  localProvider,
  setNotice,
  onStream,
  onJump,
}: {
  base: string;
  inspector: Inspector | null;
  cards: CardView[];
  requiresLocalProvider: boolean;
  localProvider: LocalProvider | null;
  setNotice: (s: string | null) => void;
  onStream: (s: StreamTarget) => void;
  onJump: (cardType: string) => void;
}) {
  async function runRisk() {
    if (requiresLocalProvider && !localProvider) {
      setNotice("Choose a local provider before starting an agent pass.");
      return;
    }
    const r = await post(
      `${base}/preflight/run-risk`,
      requiresLocalProvider ? { provider: localProvider } : {},
    );
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.session_id) {
      setNotice(null);
      onStream({ id: j.session_id, title: "Methodological risk pass" });
    } else {
      setNotice(`Could not start risk pass: ${j.error ?? "no provider"}`);
    }
  }
  if (!inspector) return <aside />;
  const byType = new Map(cards.map((c) => [c.card_type, c]));
  const blocking = [
    ...inspector.findings.filter((f) => f.severity === "blocking"),
    ...inspector.riskFindings.filter((f) => f.severity === "blocking").map((f) => ({ ...f })),
  ];
  const important = [
    ...inspector.findings.filter((f) => f.severity === "important"),
    ...inspector.riskFindings.filter((f) => f.severity === "important").map((f) => ({ ...f })),
  ];
  return (
    <aside className="border-l border-[color:var(--color-outline-variant)] pl-4 max-h-[72vh] overflow-y-auto sticky top-[96px]">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="label">Preflight</h2>
        <button
          onClick={runRisk}
          className="text-[11px] text-[color:var(--color-ink)] hover:text-[color:var(--color-redink)]"
        >
          Run risk check
        </button>
      </div>

      {inspector.nextBestAction && (
        <button
          onClick={() => inspector.nextBestActionCard && onJump(inspector.nextBestActionCard)}
          className="block w-full text-left mb-4 px-2 py-1.5 border border-[color:var(--color-primary)] text-[12px] hover:bg-[color:var(--color-surface-container-low)]"
        >
          <span className="font-mono text-[10px] uppercase text-[color:var(--color-on-surface-variant)]">
            Next best action
          </span>
          <div className="mt-0.5 text-[color:var(--color-primary)]">{inspector.nextBestAction} →</div>
        </button>
      )}

      <FindingGroup title={`Blocking (${blocking.length})`} findings={blocking} byType={byType} onJump={onJump} />
      <FindingGroup title={`Important (${important.length})`} findings={important} byType={byType} onJump={onJump} />

      <div className="mt-4">
        <div className="font-mono text-[10px] uppercase text-[color:var(--color-on-surface-variant)] mb-1">
          Guideline map
        </div>
        {inspector.mapping.map((m) => (
          <div key={m.guideline} className="text-[12px] flex justify-between">
            <span>{m.guideline}</span>
            <span className="font-mono tabular">
              {m.ready}/{m.total}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function FindingGroup({
  title,
  findings,
  byType,
  onJump,
}: {
  title: string;
  findings: { severity: string; card_type?: string | null; title: string; detail_md?: string | null }[];
  byType: Map<string, CardView>;
  onJump: (cardType: string) => void;
}) {
  if (findings.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="font-mono text-[10px] uppercase text-[color:var(--color-on-surface-variant)] mb-1">
        {title}
      </div>
      <ul className="space-y-2">
        {findings.map((f, i) => {
          const card = f.card_type ? byType.get(f.card_type) : undefined;
          return (
            <li key={i} className={`pl-2 border-l-2 text-[12px] ${PREFLIGHT_SEVERITY_STYLES[f.severity] ?? ""}`}>
              {f.card_type ? (
                <button onClick={() => onJump(f.card_type!)} className="text-left hover:underline">
                  {f.title}
                </button>
              ) : (
                <div>{f.title}</div>
              )}
              {f.detail_md && (
                <div className="text-[11px] text-[color:var(--color-on-surface-variant)]">{f.detail_md}</div>
              )}
              {card && card.dependsOn.length > 0 && card.stale && (
                <div className="mt-0.5 text-[10px] text-[color:var(--color-on-surface-variant)]">
                  upstream:{" "}
                  {card.dependsOn.map((d, j) => (
                    <span key={d}>
                      {j > 0 && ", "}
                      <button onClick={() => onJump(d)} className="underline hover:text-[color:var(--color-redink)]">
                        {byType.get(d)?.label ?? d}
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ArtifactBar({
  studyId,
  base,
  artifacts,
}: {
  studyId: string;
  base: string;
  artifacts: ArtifactSummary[];
}) {
  return (
    <section className="mt-8 border-t border-[color:var(--color-outline-variant)] pt-4">
      <h2 className="label mb-3">Artifacts</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {artifacts.map((a) => (
          <div key={a.kind} className="border border-[color:var(--color-outline-variant)] rounded p-3">
            <Link
              href={`/methods/${studyId}/artifact/${a.kind}`}
              className="font-display text-[14px] leading-tight hover:text-[color:var(--color-redink)]"
            >
              {a.title}
            </Link>
            <div className="mt-1 text-[11px] font-mono text-[color:var(--color-on-surface-variant)]">
              {a.ready_pct}% ready
            </div>
            <div className="mt-2 h-1 bg-[color:var(--color-outline-variant)] rounded">
              <div className="h-1 bg-[color:var(--color-primary)] rounded" style={{ width: `${a.ready_pct}%` }} />
            </div>
            <div className="mt-2 flex gap-2 text-[10px] font-mono uppercase">
              <Link
                href={`/methods/${studyId}/artifact/${a.kind}`}
                className="hover:text-[color:var(--color-redink)]"
              >
                view
              </Link>
              {["md", "csv", "json"].map((fmt) => (
                <a
                  key={fmt}
                  href={`${base}/artifacts/${a.kind}/export?format=${fmt}`}
                  className="hover:text-[color:var(--color-redink)]"
                >
                  {fmt}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DecisionLog({ log }: { log: LogEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-8 border-t border-[color:var(--color-outline-variant)] pt-4">
      <button onClick={() => setOpen((o) => !o)} className="label flex items-center gap-2">
        Decision log ({log.length}) {open ? "▾" : "▸"}
      </button>
      {open && (
        <ul className="mt-3 space-y-2">
          {log.map((e) => (
            <li key={e.id} className="text-[12px] border-l-2 border-[color:var(--color-outline-variant)] pl-2">
              <span className="font-mono text-[10px] uppercase text-[color:var(--color-on-surface-variant)]">
                {e.action} · {e.card_type ?? "study"}
              </span>
              {e.decision_md && <div>{e.decision_md}</div>}
              {e.reason_md && (
                <div className="text-[color:var(--color-on-surface-variant)] italic">{e.reason_md}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ProposalOption {
  id: string;
  label: string;
  value_suggestion: string | null;
  consequence_md: string | null;
}

function StreamModal({
  base,
  target,
  onClose,
  onTurnComplete,
  onUseProposal,
}: {
  base: string;
  target: StreamTarget;
  onClose: () => void;
  onTurnComplete: () => void;
  onUseProposal: (cardType: string, value: string) => void;
}) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [options, setOptions] = useState<ProposalOption[]>([]);

  // Poll for posted proposal options while the proposal pass runs.
  useEffect(() => {
    if (!target.cardType) return;
    let active = true;
    const tick = async () => {
      const r = await fetch(`${base}/cards/${target.cardType}/proposals`)
        .then((x) => x.json())
        .catch(() => []);
      if (active) setOptions(r as ProposalOption[]);
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [base, target.cardType]);

  async function send() {
    const content = reply.trim();
    if (!content) return;
    setSending(true);
    setErr(null);
    const r = await post(`${base}/sessions/${target.id}/messages`, { content });
    setSending(false);
    if (r.ok) setReply("");
    else {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? "could not send");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-ink)] rounded p-5 w-[760px] max-w-[92vw] max-h-[88vh] flex flex-col">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[20px]">{target.title}</h2>
          <button
            onClick={onClose}
            className="text-[12px] font-mono uppercase text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
          >
            Close
          </button>
        </div>

        {options.length > 0 && target.cardType && (
          <div className="mb-3 border border-[color:var(--color-outline-variant)] rounded">
            <div className="px-3 py-1 text-[10px] font-mono uppercase text-[color:var(--color-on-surface-variant)] border-b border-[color:var(--color-outline-variant)]">
              Proposed options — pick one to pre-fill the card
            </div>
            <ul className="divide-y divide-[color:var(--color-outline-variant)]">
              {options.map((o) => (
                <li key={o.id} className="flex items-start gap-3 px-3 py-2">
                  <div className="flex-1">
                    <div className="text-[13px] font-display">{o.label}</div>
                    {o.consequence_md && (
                      <div className="text-[11px] text-[color:var(--color-on-surface-variant)]">
                        {o.consequence_md}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      onUseProposal(target.cardType!, o.value_suggestion ?? o.label)
                    }
                    className="shrink-0 px-2 py-1 text-[11px] font-mono uppercase border border-[color:var(--color-primary)] text-[color:var(--color-primary)] hover:bg-[color:var(--color-primary)] hover:text-[color:var(--color-on-primary)]"
                  >
                    Use this
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          <SessionStream sessionId={target.id} workflow="methods" onTurnComplete={onTurnComplete} />
        </div>

        <div className="mt-3 border-t border-[color:var(--color-outline-variant)] pt-3">
          <div className="flex gap-2 items-end">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
              rows={2}
              placeholder="Reply to the agent — answer its question or ask for a different framing… (⌘/Ctrl+Enter)"
              className="flex-1 bg-transparent border border-[color:var(--color-outline-variant)] rounded p-2 text-[13px] focus:outline-none focus:border-[color:var(--color-primary)]"
            />
            <button
              onClick={send}
              disabled={sending || !reply.trim()}
              className="px-4 py-2 text-[12px] font-mono uppercase border border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
          {err && <p className="mt-1 text-[11px] text-[color:var(--color-error)]">{err}</p>}
          <p className="mt-2 text-[11px] text-[color:var(--color-on-surface-variant)]">
            Pick an option above (pre-fills the card, you still save), reply to refine,
            or close and edit the card directly — the agent never sets a value for you.
          </p>
        </div>
      </div>
    </div>
  );
}

function ImportModal({
  base,
  onClose,
  onDone,
  onStream,
}: {
  base: string;
  onClose: () => void;
  onDone: (msg: string) => void;
  onStream: (s: StreamTarget) => void;
}) {
  const [source, setSource] = useState<"mdr" | "rw">("mdr");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      setError("Payload must be valid JSON.");
      setBusy(false);
      return;
    }
    const r = await post(`${base}/snapshots`, { source, data });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error ? JSON.stringify(j.error) : "import failed");
      setBusy(false);
      return;
    }
    if (j.has_digest) {
      onDone(`Imported ${source.toUpperCase()} snapshot — extracted ${j.extracted} evidence items.`);
      return;
    }
    const ex = await post(`${base}/snapshots/${j.snapshot.id}/extract`, {});
    const exj = await ex.json().catch(() => ({}));
    if (ex.ok && exj.session_id) {
      onStream({ id: exj.session_id, title: `Extracting ${source.toUpperCase()} evidence` });
    }
    onDone(
      ex.ok && exj.session_id
        ? `Imported ${source.toUpperCase()} snapshot — running agent extraction…`
        : `Imported ${source.toUpperCase()} snapshot (no digest; extraction unavailable: ${exj.error ?? "no provider"}).`,
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-ink)] rounded p-5 w-[560px] max-w-[90vw]">
        <h2 className="font-display text-[20px] mb-3">Import evidence snapshot</h2>
        <div className="flex gap-3 mb-3 text-[12px]">
          {(["mdr", "rw"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`px-3 py-1 border rounded font-mono uppercase ${
                source === s
                  ? "border-[color:var(--color-primary)] text-[color:var(--color-primary)]"
                  : "border-[color:var(--color-outline-variant)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder='Paste the snapshot JSON. A {"digest": {...}} block is extracted automatically; otherwise the agent extraction pass runs.'
          className="w-full bg-transparent border border-[color:var(--color-outline-variant)] rounded p-2 text-[12px] font-mono focus:outline-none focus:border-[color:var(--color-primary)]"
        />
        {error && <p className="mt-2 text-[12px] text-[color:var(--color-error)]">{error}</p>}
        <div className="mt-3 flex gap-3 justify-end text-[12px]">
          <button onClick={onClose} className="text-[color:var(--color-on-surface-variant)]">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !text.trim()}
            className="px-4 py-1.5 border border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-surface)] disabled:opacity-40 font-mono uppercase"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
