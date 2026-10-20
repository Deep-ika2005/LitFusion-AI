import { reconstructAbstract } from "./abstract";
import type { Paper, Author, Source, OpenAccess, SearchFacets } from "@/types";
import { getPublisherDefinition } from "./verification/publisher";

const OPENALEX_BASE = "https://api.openalex.org";

function getOpenAlexApiKey(): string | null {
  return (process.env.OPENALEX_API_KEY || "").trim() || null;
}

/** Boolean only (never leaks the secret) so the API route can tell the client why a request was throttled. */
export function hasOpenAlexApiKey(): boolean {
  return getOpenAlexApiKey() !== null;
}

/**
 * Contact address for OpenAlex' polite pool. The previous hardcoded placeholder
 * (litfusion-ai@example.com) is shared by every install of this app, so OpenAlex
 * aggregates it into one heavily-throttled anonymous bucket. Fall back to the
 * address the free API key was issued to when no explicit one is configured.
 */
function getMailto(): string | null {
  const configured = (process.env.OPENALEX_MAILTO || "").trim();
  if (configured) return configured;
  const key = getOpenAlexApiKey();
  if (!key) return null;
  const match = /^key:(.+?)@/.exec(key);
  return match ? `${match[1]}@` : null;
}

interface OpenAlexSource {
  id: string;
  display_name: string;
  type: string;
  is_oa: boolean;
  is_core?: boolean;
  issn_l?: string | null;
  issn?: string[] | null;
  host_organization_name: string | null;
  host_organization_lineage?: string[] | null;
}

interface OpenAlexLocation {
  source: OpenAlexSource | null;
  landing_page_url: string | null;
  pdf_url: string | null;
  is_oa?: boolean;
  is_published?: boolean | null;
  is_accepted?: boolean | null;
  version?: string | null;
  raw_type?: string | null;
  raw_source_name?: string | null;
  license?: string | null;
}

export interface OpenAlexWork {
  id: string;
  doi: string | null;
  title: string | null;
  display_name: string | null;
  publication_year: number | null;
  publication_date: string | null;
  type: string;
  language: string | null;
  cited_by_count: number;
  is_retracted: boolean;
  is_paratext?: boolean;
  abstract_inverted_index: Record<string, number[]> | null;
  indexed_in?: string[] | null;
  biblio?: {
    volume?: string | null;
    issue?: string | null;
    first_page?: string | null;
    last_page?: string | null;
  } | null;
  authorships: Array<{
    author: { id: string; display_name: string; orcid: string | null };
    institutions: Array<{ display_name: string }>;
  }>;
  primary_location: OpenAlexLocation | null;
  locations?: OpenAlexLocation[] | null;
  open_access: {
    is_oa: boolean;
    oa_status: string | null;
    oa_url: string | null;
    any_repository_has_fulltext: boolean;
  };
  best_oa_location: {
    landing_page_url: string | null;
    pdf_url: string | null;
  } | null;
  topics: Array<{ display_name: string; score: number }>;
  keywords: Array<{ display_name: string; score: number }>;
  primary_topic: { display_name: string } | null;
  relevance_score: number | null;
}

interface OpenAlexResponse {
  meta: {
    count: number;
    per_page: number;
    page: number;
    next_cursor: string | null;
  };
  results: OpenAlexWork[];
}

export interface OpenAlexSearchParams {
  query: string;
  page?: number;
  perPage: number;
  sort: string;
  yearFrom: number | null;
  yearTo: number | null;
  types: string[];
  accessType: string;
  minCitations: number | null;
  /** Canonical publisher id from the publisher filter ("all" / "" to disable). */
  publisher?: string;
  /** Resolved OpenAlex publisher ids for a free-text publisher query (custom "Other" search). */
  customPublisherIds?: string[];
  cursor?: string;
}

function stripOpenAlexId(id: string | null | undefined): string {
  return (id || "").replace("https://openalex.org/", "");
}

function normalizeSource(raw: OpenAlexSource | null | undefined): Source | null {
  if (!raw) return null;
  const issnList = (raw.issn ?? []).filter(Boolean);
  return {
    id: stripOpenAlexId(raw.id),
    displayName: raw.display_name || "Unknown",
    issn: raw.issn_l || issnList[0] || null,
    issnL: raw.issn_l || null,
    issnList,
    type: raw.type || "unknown",
    isOa: raw.is_oa || false,
    hostOrganizationName: raw.host_organization_name || null,
    hostOrganizationIds: (raw.host_organization_lineage ?? []).map(stripOpenAlexId).filter(Boolean),
    isCore: raw.is_core === true,
  };
}

export function normalizeWork(work: OpenAlexWork): Paper {
  const authors: Author[] = (work.authorships || []).slice(0, 20).map((a) => ({
    id: a.author.id?.replace("https://openalex.org/", "") || "",
    name: a.author.display_name || "Unknown",
    orcid: a.author.orcid || null,
  }));

  const primary = work.primary_location;
  const source: Source | null = normalizeSource(primary?.source);

  const openAccess: OpenAccess = {
    isOa: work.open_access?.is_oa || false,
    oaStatus: (work.open_access?.oa_status as OpenAccess["oaStatus"]) || null,
    oaUrl: work.open_access?.oa_url || null,
    anyRepositoryHasFulltext: work.open_access?.any_repository_has_fulltext || false,
  };

  const pdfUrl = work.best_oa_location?.pdf_url || primary?.pdf_url || null;
  let landingPageUrl =
    work.best_oa_location?.landing_page_url ||
    primary?.landing_page_url ||
    work.open_access?.oa_url ||
    null;

  if (!landingPageUrl && work.doi) {
    landingPageUrl = work.doi;
  }

  const topics = (work.topics || []).slice(0, 5).map((t) => t.display_name);
  const keywords = (work.keywords || []).slice(0, 8).map((k) => k.display_name);

  const locations = work.locations ?? [];
  const hasVersion = (version: string) => locations.some((l) => l.version === version);

  return {
    id: work.id?.replace("https://openalex.org/", "") || "",
    openAlexId: work.id || "",
    title: work.display_name || work.title || "Untitled",
    abstract: reconstructAbstract(work.abstract_inverted_index),
    authors,
    publicationYear: work.publication_year || 0,
    publicationDate: work.publication_date || null,
    doi: work.doi || null,
    citedByCount: work.cited_by_count || 0,
    type: work.type || "other",
    source,
    openAccess,
    pdfUrl,
    landingPageUrl,
    topics,
    keywords,
    primaryTopic: work.primary_topic?.display_name || topics[0] || null,
    relevanceScore: work.relevance_score || null,
    isRetracted: work.is_retracted || false,
    publisher: null,
    publicationStatus: null,
    scopus: null,
    quartile: null,
    ranking: null,
    sourcePlatform: null,
    rawMetadata: {
      primaryLocationVersion: primary?.version ?? null,
      primaryLocationIsPublished: primary?.is_published ?? null,
      primaryLocationIsAccepted: primary?.is_accepted ?? null,
      primaryLocationRawType: primary?.raw_type ?? null,
      primaryLocationRawSourceName: primary?.raw_source_name ?? null,
      isParatext: work.is_paratext === true,
      hasPublishedVersion: hasVersion("publishedVersion"),
      hasAcceptedVersion: hasVersion("acceptedVersion"),
      hasSubmittedVersion: hasVersion("submittedVersion"),
      biblio: work.biblio
        ? {
            volume: work.biblio.volume ?? null,
            issue: work.biblio.issue ?? null,
            firstPage: work.biblio.first_page ?? null,
            lastPage: work.biblio.last_page ?? null,
          }
        : null,
      indexedIn: work.indexed_in ?? [],
    },
  };
}

export interface OpenAlexSearchResult {
  papers: Paper[];
  totalResults: number;
  nextCursor: string | null;
  facets: SearchFacets;
  /** Works fetched from OpenAlex before any client-side verification filtering. */
  scanned: number;
}

function buildFilterString(params: {
  yearFrom: number | null;
  yearTo: number | null;
  types: string[];
  accessType: string;
  minCitations: number | null;
  publisher?: string;
  customPublisherIds?: string[];
}): string {
  const filters: string[] = [];
  if (params.yearFrom) filters.push(`from_publication_date:${params.yearFrom}-01-01`);
  if (params.yearTo) filters.push(`to_publication_date:${params.yearTo}-12-31`);
  if (params.types.length > 0) filters.push(`type:${params.types.join("|")}`);
  if (params.accessType === "open") filters.push("open_access.is_oa:true");
  else if (params.accessType === "restricted") filters.push("open_access.is_oa:false");
  if (params.minCitations) filters.push(`cited_by_count:>${params.minCitations}`);
  // Publisher is pushed down to OpenAlex using the publisher lineage, which is the
  // publisher entity OpenAlex/Crossref assigns to the venue. OpenAlex documents
  // this filter with full entity URLs (e.g.
  // primary_location.source.publisher_lineage:https://openalex.org/P4310320547),
  // and bare ids are silently ignored upstream — which used to leave the
  // client-side verification filter as the only gate and collapsed publisher
  // searches to a handful of matches. Always send the URL form.
  const predefinedIds = getPublisherDefinition(params.publisher)?.openAlexPublisherIds;
  const publisherIds =
    predefinedIds && predefinedIds.length > 0
      ? predefinedIds
      : (params.customPublisherIds ?? []).length > 0
        ? params.customPublisherIds!
        : undefined;
  if (publisherIds && publisherIds.length > 0) {
    const lineageValues = publisherIds.map((id) =>
      id.startsWith("https://openalex.org/") ? id : `https://openalex.org/${id}`
    );
    filters.push(`primary_location.source.publisher_lineage:${lineageValues.join("|")}`);
  }
  return filters.join(",");
}

/**
 * Resolve a free-text publisher name (e.g. "Nature", "SAGE", "IEEE") to OpenAlex
 * publisher ids via the OpenAlex Publishers API. Used to push a custom "Other"
 * publisher search down to OpenAlex for recall; the client-side verification
 * filter remains the source of truth. Returns [] when nothing matches.
 * Cached per name for the process lifetime.
 */
const publisherResolveCache = new Map<string, { ids: string[]; expiresAt: number }>();
const PUBLISHER_RESOLVE_TTL_MS = 60 * 60 * 1000;

export async function resolvePublisherIdsByName(name: string): Promise<string[]> {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return [];
  const cached = publisherResolveCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;
  try {
    const url = new URL(`${OPENALEX_BASE}/publishers`);
    const apiKey = getOpenAlexApiKey();
    if (apiKey) url.searchParams.set("api_key", apiKey);
    const mailto = getMailto();
    if (mailto) url.searchParams.set("mailto", mailto);
    url.searchParams.set("search", name.trim());
    url.searchParams.set("per-page", "5");
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: Array<{ id?: string }> };
    const ids = (data.results ?? [])
      .map((r) => (r.id || "").replace("https://openalex.org/", "").trim())
      .filter(Boolean)
      .slice(0, 5);
    publisherResolveCache.set(key, { ids, expiresAt: Date.now() + PUBLISHER_RESOLVE_TTL_MS });
    return ids;
  } catch {
    return [];
  }
}

export function clearPublisherResolveCache(): void {
  publisherResolveCache.clear();
}

function buildSortString(sort: string): string {
  switch (sort) {
    case "newest": return "publication_date:desc";
    case "oldest": return "publication_date:asc";
    case "citations_desc": return "cited_by_count:desc";
    case "citations_asc": return "cited_by_count:asc";
    case "title_asc": return "display_name";
    case "title_desc": return "display_name:desc";
    // Hybrid ("best_match") and quartile sorts are computed client-side after
    // verification, so fetch upstream in relevance order for the best candidate set.
    case "best_match":
    case "quartile_desc":
    case "relevance":
    default: return "relevance_score:desc";
  }
}

function extractFacets(works: OpenAlexWork[]): SearchFacets {
  const typeCounts: Record<string, number> = {};
  let openCount = 0;
  let restrictedCount = 0;
  const yearCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const authorCounts: Record<string, number> = {};

  for (const work of works) {
    const type = work.type || "other";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    if (work.open_access?.is_oa) openCount++;
    else restrictedCount++;
    const year = work.publication_year?.toString() || "Unknown";
    yearCounts[year] = (yearCounts[year] || 0) + 1;
    const sourceName = work.primary_location?.source?.display_name || "Unknown";
    sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;
    for (const authorship of work.authorships || []) {
      const authorName = authorship.author?.display_name;
      if (authorName) authorCounts[authorName] = (authorCounts[authorName] || 0) + 1;
    }
  }

  return { typeCounts, accessCounts: { open: openCount, restricted: restrictedCount }, yearCounts, sourceCounts, authorCounts };
}

export function buildWorksUrl(params: OpenAlexSearchParams): URL {
  const filterStr = buildFilterString(params);
  const sortStr = buildSortString(params.sort);
  const url = new URL(`${OPENALEX_BASE}/works`);
  const apiKey = getOpenAlexApiKey();
  if (apiKey) url.searchParams.set("api_key", apiKey);
  const mailto = getMailto();
  if (mailto) url.searchParams.set("mailto", mailto);
  if (params.query) url.searchParams.set("search", params.query);
  if (filterStr) url.searchParams.set("filter", filterStr);
  url.searchParams.set("sort", sortStr);
  url.searchParams.set("per_page", Math.min(params.perPage, 100).toString());
  if (params.cursor) {
    url.searchParams.set("cursor", params.cursor);
  } else {
    url.searchParams.set("page", (params.page ?? 1).toString());
  }
  return url;
}

/**
 * OpenAlex throttles the anonymous pool aggressively and answers HTTP 429 with a
 * `retryAfter` of 30-60s. A search therefore fails constantly without a free API key
 * (see OPENALEX_API_KEY in .env.example). The proxy absorbs that on two levels:
 *
 *   1. a short response cache, so paging back and forth through a result set — or a
 *      client re-rendering — does not re-request the same upstream page;
 *   2. retries that actually honour the requested wait, bounded by a time budget so a
 *      single user request never hangs.
 */
const RESPONSE_TTL_MS = 60_000;
const STALE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 300;
const MAX_ATTEMPTS = 4;
const MAX_RETRY_BUDGET_MS = 25_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const responseCache = new Map<string, { value: OpenAlexResponse; freshUntil: number; staleUntil: number }>();
const inFlight = new Map<string, Promise<OpenAlexResponse>>();

function readCache(key: string): OpenAlexResponse | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.staleUntil < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: OpenAlexResponse, ttlMs: number): void {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  const now = Date.now();
  responseCache.set(key, { value, freshUntil: now + ttlMs, staleUntil: now + STALE_TTL_MS });
}

/** The newest cached copy regardless of freshness, used only to survive an upstream failure. */
function readStaleCache(key: string): OpenAlexResponse | null {
  const hit = responseCache.get(key);
  return hit && hit.staleUntil >= Date.now() ? hit.value : null;
}

export function clearOpenAlexCaches(): void {
  responseCache.clear();
  inFlight.clear();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(response: Response, body: string): number | undefined {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
    // Retry-After is also allowed to be an HTTP date.
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  const fromBody = /"retryAfter"\s*:\s*(\d+)/i.exec(body);
  if (fromBody) return Number(fromBody[1]);
  const message = /retry in (\d+)s/i.exec(body);
  return message ? Number(message[1]) : undefined;
}

async function requestOpenAlexWorks(url: URL): Promise<OpenAlexResponse> {
  const startedAt = Date.now();

  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    } catch (cause) {
      // A connection reset or DNS/socket failure carries no HTTP status. Tag it as
      // retryable so the route answers 503 (try again) rather than a hard 500.
      const error = new Error(
        `OpenAlex request failed: ${cause instanceof Error ? cause.message : "network error"}`
      ) as Error & { status?: number; retryAfterSeconds?: number };
      error.status = 503;
      error.retryAfterSeconds = 1;
      throw error;
    }

    if (response.ok) {
      return (await response.json()) as OpenAlexResponse;
    }

    const body = await response.text().catch(() => "");
    const error = new Error(
      `OpenAlex API error: ${response.status} ${response.statusText} — ${body.slice(0, 300)}`
    ) as Error & { status?: number; retryAfterSeconds?: number };
    error.status = response.status;
    // OpenAlex asks anonymous clients to back off; surface the wait so the route can
    // answer 429 instead of reporting an upstream failure as a bad gateway.
    error.retryAfterSeconds = parseRetryAfterSeconds(response, body);

    // A 503 from the search cluster ("anonymous search is paused", overload page)
    // does not clear within a seconds-long retry loop — retrying only burns the
    // request budget and delays the actionable error. Fail fast with the wait
    // attached and let the client retry on its own schedule.
    if (response.status === 503) {
      error.retryAfterSeconds ??= 15;
      throw error;
    }

    const elapsed = Date.now() - startedAt;
    const budgetLeft = MAX_RETRY_BUDGET_MS - elapsed;
    const isLastAttempt = attempt >= MAX_ATTEMPTS;
    if (!RETRYABLE_STATUS.has(response.status) || isLastAttempt || budgetLeft <= 0) throw error;

    // Only wait when the requested backoff actually fits the remaining budget. If OpenAlex
    // asks for longer than we are willing to hold the request open, fail fast with the
    // wait attached and let the client do the waiting — a 25s hang followed by an error is
    // worse than an immediate, actionable "retry in 40s".
    const asked = (error.retryAfterSeconds ?? 1) * 1000;
    if (asked > budgetLeft) throw error;

    // Jitter keeps concurrent retries from re-colliding on the same throttled bucket.
    const waitMs = Math.min(asked + Math.random() * 500, budgetLeft);
    await sleep(waitMs);
  }
}

/**
 * Fetch a works page, collapsing duplicate concurrent requests for the same URL onto a
 * single upstream call and serving short-lived cached copies in between.
 */
export async function fetchOpenAlexWorks(url: URL): Promise<OpenAlexResponse> {
  const key = url.toString();

  const cached = readCache(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const data = await requestOpenAlexWorks(url);
      writeCache(key, data, RESPONSE_TTL_MS);
      return data;
    } catch (error) {
      // Better to show slightly stale results than an error box when the upstream is
      // throttled — the copy is for the exact same query, so it is still correct.
      const stale = readStaleCache(key);
      if (stale) return stale;
      throw error;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}

export async function searchPapers(params: OpenAlexSearchParams): Promise<OpenAlexSearchResult> {
  const url = buildWorksUrl(params);
  const data = await fetchOpenAlexWorks(url);
  return {
    papers: data.results.map(normalizeWork),
    totalResults: data.meta.count,
    nextCursor: data.meta.next_cursor,
    facets: extractFacets(data.results),
    scanned: data.results.length,
  };
}

export async function searchPapersMultiPage(params: {
  query: string; perPage: number; sort: string;
  yearFrom: number | null; yearTo: number | null; types: string[];
  accessType: string; minCitations: number | null; targetCount: number;
  publisher?: string;
  customPublisherIds?: string[];
}): Promise<{ papers: Paper[]; totalResults: number; facets: SearchFacets }> {
  const allPapers: Paper[] = [];
  let cursor: string | undefined;
  let totalResults = 0;
  let facets: SearchFacets = { typeCounts: {}, accessCounts: { open: 0, restricted: 0 }, yearCounts: {}, sourceCounts: {}, authorCounts: {} };
  const batchSize = Math.min(params.perPage, 100);
  let isFirst = true;

  while (allPapers.length < params.targetCount) {
    const result = await searchPapers({ ...params, page: 1, perPage: batchSize, cursor });
    if (isFirst) { totalResults = result.totalResults; facets = result.facets; isFirst = false; }
    const remaining = params.targetCount - allPapers.length;
    const toTake = Math.min(result.papers.length, remaining);
    allPapers.push(...result.papers.slice(0, toTake));
    cursor = result.nextCursor || undefined;
    if (!cursor || result.papers.length === 0 || toTake < result.papers.length) break;
  }

  return { papers: allPapers, totalResults, facets };
}

export async function getPaperById(id: string): Promise<Paper | null> {
  const url = new URL(`${OPENALEX_BASE}/works/${id}`);
  const apiKey = getOpenAlexApiKey();
  if (apiKey) url.searchParams.set("api_key", apiKey);
  const mailto = getMailto();
  if (mailto) url.searchParams.set("mailto", mailto);
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  return normalizeWork(await response.json());
}
