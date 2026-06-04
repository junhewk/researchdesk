// Resolve a model-quoted paragraph to a concrete offset/text inside the
// stored manuscript. Used to extract a single paragraph for the local detail
// pass or the optional paragraph-level cloud assist path.

export interface AnchorResult {
  status: "matched" | "unmatched";
  offset: number | null;
  text: string | null;
  // 0..1 similarity score for the chosen window (1 = exact substring)
  similarity: number;
}

export function splitParagraphs(md: string): Array<{ offset: number; text: string }> {
  const chunks: Array<{ offset: number; text: string }> = [];
  let offset = 0;
  const paragraphs = md.split(/\n{2,}/);
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed.length > 0) {
      const idx = md.indexOf(p, offset);
      if (idx >= 0) chunks.push({ offset: idx, text: trimmed });
    }
    offset += p.length + 2;
  }
  return chunks;
}

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function normalizeForExact(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function anchorParagraph(
  manuscript: string,
  quoted: string,
  opts?: { minSimilarity?: number },
): AnchorResult {
  const threshold = opts?.minSimilarity ?? 0.45;
  const q = quoted.trim();
  if (!q) return { status: "unmatched", offset: null, text: null, similarity: 0 };

  // 1. Exact substring (post-whitespace normalization).
  const normalizedManuscript = manuscript;
  const normalizedQuote = normalizeForExact(q);

  const exactOffset = normalizedManuscript.indexOf(q);
  if (exactOffset >= 0) {
    return { status: "matched", offset: exactOffset, text: q, similarity: 1 };
  }

  // 2. Try a whitespace-collapsed exact match against each paragraph.
  const paragraphs = splitParagraphs(manuscript);
  for (const p of paragraphs) {
    if (normalizeForExact(p.text) === normalizedQuote) {
      return { status: "matched", offset: p.offset, text: p.text, similarity: 0.98 };
    }
  }

  // 3. Try matching the quote's first ~12 words verbatim — handles cases
  // where the model quoted only the opening of the paragraph.
  const head = q.split(/\s+/).slice(0, 12).join(" ");
  if (head.length >= 20) {
    const headIdx = manuscript.indexOf(head);
    if (headIdx >= 0) {
      const containing = paragraphs.find(
        (p) => p.offset <= headIdx && headIdx < p.offset + p.text.length,
      );
      if (containing) {
        return {
          status: "matched",
          offset: containing.offset,
          text: containing.text,
          similarity: 0.85,
        };
      }
    }
  }

  // 4. Fuzzy: Jaccard over token sets against each paragraph. Pick best.
  const qTokens = tokenize(q);
  let best: { p: { offset: number; text: string }; score: number } | null = null;
  for (const p of paragraphs) {
    const s = jaccard(qTokens, tokenize(p.text));
    if (!best || s > best.score) best = { p, score: s };
  }

  if (best && best.score >= threshold) {
    return {
      status: "matched",
      offset: best.p.offset,
      text: best.p.text,
      similarity: best.score,
    };
  }

  return {
    status: "unmatched",
    offset: null,
    text: null,
    similarity: best?.score ?? 0,
  };
}
