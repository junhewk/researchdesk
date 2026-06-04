import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import type { ArticleSearchResult } from "./types";

interface SearchArticlesOptions {
  query: string;
  yearFrom?: number;
  yearTo?: number;
  fieldsOfStudy?: string[];
  source?: "semantic_scholar" | "openalex" | "both";
  limit?: number;
}

export async function searchArticles(opts: SearchArticlesOptions): Promise<ArticleSearchResult[]> {
  const source = opts.source ?? "both";
  const limit = opts.limit ?? 10;
  const results: ArticleSearchResult[] = [];

  const promises: Promise<ArticleSearchResult[]>[] = [];
  if (source === "semantic_scholar" || source === "both") {
    promises.push(searchSemanticScholar(opts.query, limit, opts.yearFrom, opts.yearTo, opts.fieldsOfStudy));
  }
  if (source === "openalex" || source === "both") {
    promises.push(searchOpenAlex(opts.query, limit, opts.yearFrom, opts.yearTo));
  }
  const settled = await Promise.all(promises);
  for (const batch of settled) results.push(...batch);

  const db = getDb();
  const cacheAll = db.transaction((articles: ArticleSearchResult[]) => {
    for (const r of articles) cacheArticleReference(r);
  });
  cacheAll(results);

  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.doi || `${r.source}:${r.external_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

async function searchSemanticScholar(
  query: string,
  limit: number,
  yearFrom?: number,
  yearTo?: number,
  fieldsOfStudy?: string[],
): Promise<ArticleSearchResult[]> {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: "title,authors,year,venue,externalIds,abstract,citationCount,url",
  });

  if (yearFrom || yearTo) {
    const range = `${yearFrom || ""}-${yearTo || ""}`;
    params.set("year", range);
  }
  if (fieldsOfStudy?.length) {
    params.set("fieldsOfStudy", fieldsOfStudy.join(","));
  }

  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  try {
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
      { headers },
    );
    if (!res.ok) return [];

    const data = (await res.json()) as {
      data?: Array<{
        paperId: string;
        title: string;
        authors?: Array<{ name: string }>;
        year?: number;
        venue?: string;
        externalIds?: { DOI?: string };
        abstract?: string;
        citationCount?: number;
        url?: string;
      }>;
    };

    return (data.data ?? []).map((paper) => ({
      title: paper.title,
      authors: paper.authors?.map((a) => a.name) ?? [],
      year: paper.year ?? null,
      journal: paper.venue ?? null,
      doi: paper.externalIds?.DOI ?? null,
      abstract: paper.abstract ?? null,
      citation_count: paper.citationCount ?? null,
      source: "semantic_scholar" as const,
      external_id: paper.paperId,
      url: paper.url ?? null,
    }));
  } catch {
    return [];
  }
}

async function searchOpenAlex(
  query: string,
  limit: number,
  yearFrom?: number,
  yearTo?: number,
): Promise<ArticleSearchResult[]> {
  const params = new URLSearchParams({
    search: query,
    per_page: String(limit),
    select: "id,title,authorships,publication_year,primary_location,doi,cited_by_count",
  });

  const filters: string[] = [];
  if (yearFrom) filters.push(`from_publication_date:${yearFrom}-01-01`);
  if (yearTo) filters.push(`to_publication_date:${yearTo}-12-31`);
  if (filters.length) params.set("filter", filters.join(","));

  const mailto = process.env.OPENALEX_EMAIL || "reviewer-agent@localhost";
  params.set("mailto", mailto);

  try {
    const res = await fetch(`https://api.openalex.org/works?${params}`);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results?: Array<{
        id: string;
        title: string;
        authorships?: Array<{ author: { display_name: string } }>;
        publication_year?: number;
        primary_location?: { source?: { display_name?: string } };
        doi?: string;
        cited_by_count?: number;
      }>;
    };

    return (data.results ?? []).map((work) => ({
      title: work.title,
      authors: work.authorships?.map((a) => a.author.display_name) ?? [],
      year: work.publication_year ?? null,
      journal: work.primary_location?.source?.display_name ?? null,
      doi: work.doi?.replace("https://doi.org/", "") ?? null,
      abstract: null,
      citation_count: work.cited_by_count ?? null,
      source: "openalex" as const,
      external_id: work.id,
      url: work.doi ?? null,
    }));
  } catch {
    return [];
  }
}

export interface ArticleValidationResult {
  exists: boolean;
  is_retracted: boolean;
  title?: string;
  authors?: string[];
  year?: number;
  journal?: string;
  citation_count?: number;
  source: "crossref" | "openalex" | "none";
}

function normalizeDoi(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "");
}

export async function validateDoi(rawDoi: string): Promise<ArticleValidationResult> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return { exists: false, is_retracted: false, source: "none" };

  const fromCrossref = await fetchCrossrefWork(doi);
  if (fromCrossref) return fromCrossref;

  const fromOpenAlex = await fetchOpenAlexWorkByDoi(doi);
  if (fromOpenAlex) return fromOpenAlex;

  return { exists: false, is_retracted: false, source: "none" };
}

async function fetchCrossrefWork(doi: string): Promise<ArticleValidationResult | null> {
  const mailto = process.env.OPENALEX_EMAIL || process.env.CROSSREF_EMAIL;
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ""}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "reviewer-agent/1.0",
      },
    });
    if (res.status === 404) {
      return { exists: false, is_retracted: false, source: "crossref" };
    }
    if (!res.ok) return null;
    const data = (await res.json()) as {
      message?: {
        title?: string[];
        author?: Array<{ given?: string; family?: string }>;
        issued?: { "date-parts"?: number[][] };
        "container-title"?: string[];
        "is-referenced-by-count"?: number;
        subtype?: string;
        type?: string;
        "update-to"?: Array<{ type?: string; DOI?: string }>;
      };
    };
    const m = data.message;
    if (!m) return null;
    const isRetracted =
      m.subtype === "retraction" ||
      m.type === "retraction" ||
      Boolean(m["update-to"]?.some((u) => u.type === "retraction"));
    const authors = (m.author ?? [])
      .map((a) => [a.given, a.family].filter(Boolean).join(" ").trim())
      .filter(Boolean);
    const year = m.issued?.["date-parts"]?.[0]?.[0];
    return {
      exists: true,
      is_retracted: isRetracted,
      title: m.title?.[0],
      authors,
      year: typeof year === "number" ? year : undefined,
      journal: m["container-title"]?.[0],
      citation_count: m["is-referenced-by-count"],
      source: "crossref",
    };
  } catch {
    return null;
  }
}

async function fetchOpenAlexWorkByDoi(doi: string): Promise<ArticleValidationResult | null> {
  const mailto = process.env.OPENALEX_EMAIL || "reviewer-agent@localhost";
  const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?mailto=${encodeURIComponent(mailto)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) {
      return { exists: false, is_retracted: false, source: "openalex" };
    }
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      authorships?: Array<{ author: { display_name: string } }>;
      publication_year?: number;
      primary_location?: { source?: { display_name?: string } };
      cited_by_count?: number;
      is_retracted?: boolean;
    };
    return {
      exists: true,
      is_retracted: Boolean(data.is_retracted),
      title: data.title,
      authors: data.authorships?.map((a) => a.author.display_name) ?? [],
      year: data.publication_year,
      journal: data.primary_location?.source?.display_name,
      citation_count: data.cited_by_count,
      source: "openalex",
    };
  } catch {
    return null;
  }
}

function cacheArticleReference(article: ArticleSearchResult): void {
  const db = getDb();
  const existing = article.doi
    ? db.prepare("SELECT id FROM article_references WHERE doi = ?").get(article.doi)
    : db.prepare("SELECT id FROM article_references WHERE source = ? AND external_id = ?").get(article.source, article.external_id);

  if (existing) return;

  const id = nanoid();
  db.prepare(
    `INSERT INTO article_references (id, doi, title, authors_json, year, journal, abstract_md, source, external_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    id,
    article.doi,
    article.title,
    JSON.stringify(article.authors),
    article.year,
    article.journal,
    article.abstract,
    article.source,
    article.external_id,
    nowUnix(),
  );
}
