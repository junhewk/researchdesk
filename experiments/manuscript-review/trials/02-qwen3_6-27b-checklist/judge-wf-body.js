export const meta = {
  name: 'blind-judge-reviews',
  description: 'Blind-judge pre-generated review arm outputs against their answer keys (Claude judge)',
  phases: [{ title: 'Judge', detail: 'blinded adjudication vs gold' }],
};

const INPUT = __JUDGE_INPUT__;

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

function strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const JUDGE_SYSTEM = [
  'You are a blinded adjudicator of peer-review comments.',
  'You receive a manuscript, a list of known ground-truth issues (gold), and review comments from an UNKNOWN source.',
  '- A comment matches a gold issue only if it identifies the SAME underlying problem; gesturing near it without locating/specifying it is not a match.',
  '- Do not reward verbosity or vague hedging. Never infer which system produced the comments.',
  '- hallucination = asserts something about the manuscript that is false or unsupported (e.g., invents a statistic, a method, or a citation not present).',
  '- valid = a real, defensible issue (whether or not it is in the gold list).',
  '- specificity 0-2 (0 generic, 2 pinpoints location/quote); actionability 0-2 (0 none, 2 concrete fix).',
].join('\n');

async function judgeOne(run) {
  const m = INPUT.manuscripts[run.mid];
  const items = run.items || [];
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
  const v = await agent(`${JUDGE_SYSTEM}\n\n${user}`, {
    label: `judge:${run.arm}:${run.mid.slice(0, 4)}r${run.rep}`, phase: 'Judge', schema: JUDGE_SCHEMA,
  });
  return { mid: run.mid, arm: run.arm, rep: run.rep, nItems: items.length, nGold: m.gold.length, items, verdict: v || { per_gold: [], per_item: [] } };
}

log(`Blind-judging ${INPUT.runs.length} arm-runs with Claude.`);
const results = await parallel(INPUT.runs.map((r) => () => judgeOne(r)));
return results.filter(Boolean);
