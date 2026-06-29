export const meta = {
  name: 'persona-vs-context-review',
  description: 'Generate 6 review arms per manuscript on Claude, then blind-judge each vs its answer key',
  phases: [
    { title: 'Generate', detail: 'sub-reviews + neutral merge per arm' },
    { title: 'Judge', detail: 'blinded adjudication vs gold' },
  ],
};

const MANIFEST = __MANIFEST_JSON__;
const REPS = 1;
const ARM_NAMES = ['naive', 'persona', 'context', 'persona_context', 'ensemble_naive', 'ensemble_context'];

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          category: { type: 'string', enum: ['mechanical', 'rewrite', 'structural', 'evidence'] },
          severity: { type: 'string', enum: ['minor', 'major', 'critical'] },
          section_ref: { type: 'string' },
          content_md: { type: 'string' },
        },
        required: ['category', 'severity', 'section_ref', 'content_md'],
      },
    },
    summary_md: { type: 'string' },
  },
  required: ['items', 'summary_md'],
};

const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    per_gold: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { gold_id: { type: 'string' }, detected: { type: 'boolean' } },
        required: ['gold_id', 'detected'],
      },
    },
    per_item: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          review_item_id: { type: 'string' },
          matched_gold_id: { type: 'string' },
          valid: { type: 'boolean' },
          hallucination: { type: 'boolean' },
          specificity: { type: 'integer' },
          actionability: { type: 'integer' },
          severity_calibration: { type: 'string', enum: ['under', 'match', 'over'] },
        },
        required: ['review_item_id', 'matched_gold_id', 'valid', 'hallucination', 'specificity', 'actionability', 'severity_calibration'],
      },
    },
  },
  required: ['per_gold', 'per_item'],
};

// FNV-1a — deterministic blind ordering of comments (no Math.random in sandbox).
function strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const tag = (t) => `${t.arm}:${t.mid.slice(0, 4)}r${t.rep}`;

async function subReview(system, userBody, label) {
  const r = await agent(`${system}\n\n${userBody}`, { label, phase: 'Generate', schema: REVIEW_SCHEMA });
  return r && Array.isArray(r.items) ? r.items : [];
}

const MERGE_SYSTEM = [
  'You are a neutral review aggregator. You receive several independent review reports of the same manuscript and consolidate them into one.',
  '- Merge items describing the same underlying problem; keep the union of all genuinely distinct issues.',
  '- Never drop a real issue only one source raised, and never invent an issue no source raised.',
  '- Preserve the most specific section_ref; assign one final severity per merged issue.',
].join('\n');

async function mergeReviews(subItemsArr, label) {
  const payload = subItemsArr.map((items, i) => ({ reviewer: `r${i + 1}`, items }));
  const r = await agent(
    `${MERGE_SYSTEM}\n\nIndependent reviews (JSON):\n${JSON.stringify(payload)}\n\nReturn the consolidated review as JSON {items, summary_md}.`,
    { label, phase: 'Generate', schema: REVIEW_SCHEMA },
  );
  return r && Array.isArray(r.items) ? r.items : [];
}

async function generateArm(task) {
  const m = MANIFEST.manuscripts[task.mid];
  const arm = MANIFEST.arms[task.arm];
  const userBody =
    `## Manuscript and context\n${m.userContext}` +
    (arm.grounding ? `\n\n${m.groundingBlock}` : '') +
    `\n\n${MANIFEST.instruction}`;
  const subs = await parallel(
    arm.subCalls.map((sc) => () => subReview(sc.system, userBody, `${tag(task)}:${sc.label}`)),
  );
  const subItems = subs.map((x) => x || []);
  const items = arm.merge ? await mergeReviews(subItems, `merge:${tag(task)}`) : (subItems[0] || []);
  return { task, items, nSub: arm.subCalls.length };
}

const JUDGE_SYSTEM = [
  'You are a blinded adjudicator of peer-review comments.',
  'You receive a manuscript, a list of known ground-truth issues (gold), and review comments from an UNKNOWN source.',
  '- A comment matches a gold issue only if it identifies the SAME underlying problem; gesturing near it without locating/specifying it is not a match.',
  '- Do not reward verbosity or vague hedging. Never infer which system produced the comments.',
  '- hallucination = asserts something about the manuscript that is false or unsupported.',
  '- valid = a real, defensible issue (whether or not it is in the gold list).',
  '- specificity 0-2 (0 generic, 2 pinpoints location/quote); actionability 0-2 (0 none, 2 concrete fix).',
].join('\n');

async function judgeArm(gen, task) {
  const m = MANIFEST.manuscripts[task.mid];
  const items = gen.items || [];
  const ordered = items
    .map((it) => ({ it, h: strHash(it.content_md || '') }))
    .sort((a, b) => (a.h < b.h ? -1 : 1))
    .map((x, i) => ({ id: `item_${i + 1}`, it: x.it }));
  const gold = m.gold.map((g) => ({ gold_id: g.id, layer: g.layer, severity: g.gold_severity, issue: g.description }));
  const user = [
    '## Manuscript', m.userContext,
    '', '## Known ground-truth issues (gold)', JSON.stringify(gold),
    '', '## Review comments to adjudicate (source unknown)',
    JSON.stringify(ordered.map((p) => ({
      review_item_id: p.id, category: p.it.category, stated_severity: p.it.severity,
      section_ref: p.it.section_ref, comment: p.it.content_md,
    }))),
    '', 'For EVERY gold issue return detected true/false. For EVERY comment return matched_gold_id (a gold_id or "none"), valid, hallucination, specificity, actionability, severity_calibration.',
  ].join('\n');
  const v = await agent(`${JUDGE_SYSTEM}\n\n${user}`, { label: `judge:${tag(task)}`, phase: 'Judge', schema: JUDGE_SCHEMA });
  return {
    mid: task.mid, arm: task.arm, rep: task.rep,
    nSub: gen.nSub, nItems: items.length, nGold: m.gold.length,
    items,
    verdict: v || { per_gold: [], per_item: [] },
  };
}

const TASKS = [];
for (const mid of Object.keys(MANIFEST.manuscripts))
  for (const arm of ARM_NAMES)
    for (let rep = 1; rep <= REPS; rep += 1) TASKS.push({ mid, arm, rep });

log(`Base model: Claude. ${TASKS.length} arm-runs = ${Object.keys(MANIFEST.manuscripts).length} manuscripts x ${ARM_NAMES.length} arms x ${REPS} reps. Generating + blind-judging.`);

const results = await pipeline(TASKS, generateArm, judgeArm);
return results.filter(Boolean);
