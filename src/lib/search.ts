import type {
  AppliedFilters,
  Paper,
  SearchFacets,
  ScopusVerificationCapability,
  VerificationFacets,
} from "@/types";
import { searchPapers, resolvePublisherIdsByName } from "./openalex";
import { attachHybridScores, rankPapersByHybrid, rankPapersByPriority, rankPapersByQuartile } from "./ranking";
import { summarizeQuartileCounts } from "./verification/quartile";
import { getScopusCapability, getPublisherDefinition, isOtherPublisherPaper, OTHER_PUBLISHER_ID, verifyPapers, findPredefinedByName, normalizePublisherQuery } from "./verification";
import type { PublisherDefinition } from "./verification/publisher";

/**
 * Search pipeline:
 *   User search -> Paper data source (OpenAlex) -> Metadata normalization (openalex.ts)
 *               -> Publication verification -> Scopus verification -> Publisher verification
 *               -> Apply filters -> Display results.
 *
 * Filters that the data source can answer itself (year, type, access, citations and the
 * publisher, via OpenAlex publisher lineage) are pushed down to OpenAlex. The verification
 * filters (Scopus coverage, published-only) are applied after the records are normalized
 * and verified, so a result is only ever shown when its metadata actually supports it.
 */
export interface VerificationFilters {
  publisher: string;
  publisherQuery: string;
  scopusOnly: boolean;
  publishedOnly: boolean;
  /** Subset of ["Q1","Q2","Q3","Q4","unranked"]. Empty = no quartile filter. */
  quartiles: string[];
}

export interface PaperSearchRequest extends VerificationFilters {
  query: string;
  page: number;
  perPage: number;
  sort: string;
  yearFrom: number | null;
  yearTo: number | null;
  types: string[];
  accessType: string;
  minCitations: number | null;
  /** Collect a large result set (used by the compare/library flows). */
  fetchAll?: boolean;
  targetCount?: number;
}

export interface PaperSearchResult {
  papers: Paper[];
  totalResults: number;
  page: number;
  perPage: number;
  totalPages: number;
  facets: SearchFacets;
  nextCursor: string | null;
  appliedFilters: AppliedFilters;
  scannedCandidates: number;
  hasMoreResults: boolean;
  scopusVerification: ScopusVerificationCapability;
  /** Upstream (unfiltered) match count, reported by the fetchAll flow. */
  upstreamTotal?: number;
}

const BATCH_SIZE = 100;
const MAX_BATCHES = 20;
const MAX_CANDIDATES = BATCH_SIZE * MAX_BATCHES;

export function normalizePublisherFilter(value: string | null | undefined): string {
  return (value || "all").toLowerCase();
}

export const QUARTILE_FILTER_OPTIONS = ["Q1", "Q2", "Q3", "Q4", "unranked"] as const;

export function normalizeQuartileFilter(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const allowed = new Set<string>(QUARTILE_FILTER_OPTIONS);
  return Array.from(new Set(list.map((v) => String(v).trim()).filter((v) => allowed.has(v))));
}

export function hasVerificationFilters(filters: VerificationFilters): boolean {
  return Boolean(
    (filters.publisher && filters.publisher !== "all") ||
      (filters.publisherQuery && filters.publisherQuery.trim() !== "") ||
      filters.scopusOnly ||
      filters.publishedOnly ||
      (filters.quartiles && filters.quartiles.length > 0)
  );
}

/** Quartile gate. "unranked" matches quartile=null; unranked papers stay visible unless filtered out. */
export function matchesQuartileFilter(paper: Paper, quartiles: string[] = []): boolean {
  if (!quartiles || quartiles.length === 0) return true;
  const tier = paper.quartile?.quartile ?? null;
  const key = tier ?? "unranked";
  return quartiles.includes(key);
}

/**
 * Publisher gate. The canonical brand id is the primary signal, but the raw
 * OpenAlex publisher lineage stored on the verified result is equally
 * authoritative metadata (it is what the upstream `publisher_lineage` pushdown
 * filters on). Accepting lineage overlap here — instead of dropping the paper
 * when the brand registry has no alias for a child imprint — restores recall
 * without ever guessing a publisher from a title or journal name. Papers with
 * no publisher metadata at all still never match a publisher filter.
 */
function matchesVerifiedPublisherName(paper: Paper, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  // Only authoritative publisher metadata — never title, journal display name, or keywords.
  const candidates = [
    paper.publisher?.name,
    paper.publisher?.rawName,
    paper.source?.hostOrganizationName,
  ].filter(Boolean) as string[];
  return candidates.some((name) => name.toLowerCase().includes(q));
}

function matchesLineageIds(paper: Paper, wantedIds: string[]): boolean {
  if (wantedIds.length === 0) return false;
  const lineage = paper.publisher?.openAlexPublisherIds ?? [];
  if (lineage.length === 0) return false;
  const wanted = new Set(wantedIds.map((id) => id.replace("https://openalex.org/", "")));
  return lineage.some((id) => wanted.has(id.replace("https://openalex.org/", "")));
}

export function matchesPublisherFilter(
  paper: Paper,
  publisher: string,
  publisherQuery = "",
  resolvedPublisherIds: string[] = []
): boolean {
  const query = normalizePublisherQuery(publisherQuery);
  if ((!publisher || publisher === "all") && !query) return true;

  // Free-text custom publisher search (typed under "Other Publishers").
  // Typing a known brand (e.g. "ieee") resolves to that brand so results match
  // the dropdown; otherwise match verified publisher names + resolved lineage ids.
  if (query) {
    let queryMatch: boolean;
    const predefined: PublisherDefinition | null = findPredefinedByName(query);
    if (predefined) {
      queryMatch =
        paper.publisher?.id === predefined.id ||
        matchesLineageIds(paper, predefined.openAlexPublisherIds) ||
        matchesVerifiedPublisherName(paper, query);
    } else if (resolvedPublisherIds.length > 0 && matchesLineageIds(paper, resolvedPublisherIds)) {
      queryMatch = true;
    } else {
      queryMatch = matchesVerifiedPublisherName(paper, query);
    }
    if (!queryMatch) return false;
    // When a predefined dropdown brand is ALSO selected (only possible via a
    // hand-crafted URL since the UI clears the query on switch), require both.
    if (publisher && publisher !== "all" && publisher !== OTHER_PUBLISHER_ID) {
      if (paper.publisher?.id === publisher) return true;
      const wanted = (getPublisherDefinition(publisher)?.openAlexPublisherIds ?? []).map((id) =>
        id.replace("https://openalex.org/", "")
      );
      if (wanted.length === 0) return false;
      return matchesLineageIds(paper, wanted);
    }
    return true;
  }

  if (!publisher || publisher === "all") return true;
  // "Other Publishers": everything outside the predefined registry. The check
  // is dynamic (NOT in predefined list ⇒ other), so publishers the API has
  // never returned before need no code change to appear here.
  if (publisher === OTHER_PUBLISHER_ID) return isOtherPublisherPaper(paper);
  if (paper.publisher?.id === publisher) return true;
  const wanted = (getPublisherDefinition(publisher)?.openAlexPublisherIds ?? []).map((id) =>
    id.replace("https://openalex.org/", "")
  );
  if (wanted.length === 0) return false;
  return matchesLineageIds(paper, wanted);
}

/**
 * The single source of truth for result visibility. Exported so the UI, the API and the
 * test suite all apply exactly the same rules.
 */
export function matchesPaperFilters(
  paper: Paper,
  filters: VerificationFilters,
  resolvedPublisherIds: string[] = []
): boolean {
  if (filters.publishedOnly && paper.publicationStatus?.isPublished !== true) {
    return false;
  }
  if (filters.scopusOnly && paper.scopus?.status !== "indexed") {
    return false;
  }
  if (!matchesQuartileFilter(paper, filters.quartiles)) {
    return false;
  }
  if (!matchesPublisherFilter(paper, filters.publisher, filters.publisherQuery, resolvedPublisherIds)) {
    return false;
  }
  return true;
}

function buildVerificationFacets(papers: Paper[]): VerificationFacets {
  const publisherCounts: Record<string, number> = {};
  const scopusCounts = { indexed: 0, "not-indexed": 0, unknown: 0 };
  const publicationStatusCounts: Record<string, number> = {};

  for (const paper of papers) {
    const publisherId = paper.publisher?.id ?? null;
    if (publisherId) {
      publisherCounts[publisherId] = (publisherCounts[publisherId] || 0) + 1;
    }
    // Dynamic "Other Publishers" count: every scanned paper whose publisher is
    // outside the predefined registry, computed from actual results.
    if (isOtherPublisherPaper(paper)) {
      publisherCounts[OTHER_PUBLISHER_ID] = (publisherCounts[OTHER_PUBLISHER_ID] || 0) + 1;
    }
    const scopusStatus = paper.scopus?.status ?? "unknown";
    scopusCounts[scopusStatus] += 1;
    const status = paper.publicationStatus?.status ?? "unknown";
    publicationStatusCounts[status] = (publicationStatusCounts[status] || 0) + 1;
  }

  return { publisherCounts, scopusCounts, publicationStatusCounts, quartileCounts: summarizeQuartileCounts(papers) };
}

function mergeFacets(base: SearchFacets, verification: VerificationFacets): SearchFacets {
  return {
    ...base,
    publisherCounts: verification.publisherCounts,
    scopusCounts: verification.scopusCounts,
    publicationStatusCounts: verification.publicationStatusCounts,
    quartileCounts: verification.quartileCounts,
  };
}

/**
 * Apply the requested client-side sort. "relevance" keeps the legacy
 * high-priority order (default, unchanged). "best_match" is the quartile-based
 * hybrid ranking; "quartile_desc" is highest-quartile-first. Every other sort
 * keeps its upstream OpenAlex order. Hybrid scores are attached whenever they
 * are needed for display/sorting.
 */
function applyClientSort(papers: Paper[], sort: string): Paper[] {
  if (sort === "best_match") return rankPapersByHybrid(papers);
  if (sort === "quartile_desc") return rankPapersByQuartile(attachHybridScores(papers));
  if (sort === "relevance") return rankPapersByPriority(papers);
  return papers;
}

function attachScoresIfNeeded(papers: Paper[], sort: string): Paper[] {
  if (sort === "best_match" || sort === "quartile_desc") return papers; // already scored
  return attachHybridScores(papers);
}

export async function searchPapersWithVerification(request: PaperSearchRequest): Promise<PaperSearchResult> {
  const filters: VerificationFilters = {
    publisher: normalizePublisherFilter(request.publisher),
    publisherQuery: normalizePublisherQuery(request.publisherQuery),
    scopusOnly: request.scopusOnly,
    publishedOnly: request.publishedOnly,
    quartiles: normalizeQuartileFilter(request.quartiles),
  };
  const scopusVerification = getScopusCapability();
  const resolveScopus = scopusVerification.isAvailable;

  // Resolve free-text publisher to OpenAlex ids for upstream pushdown. A known
  // brand typed manually (e.g. "ieee") reuses its registry lineage so results
  // match the dropdown exactly; any other name uses the Publishers API.
  let customPublisherIds: string[] = [];
  if (filters.publisherQuery) {
    const predefined = findPredefinedByName(filters.publisherQuery);
    if (predefined) {
      customPublisherIds = [...predefined.openAlexPublisherIds];
    } else {
      customPublisherIds = await resolvePublisherIdsByName(filters.publisherQuery);
    }
  }

  const isPredefinedPublisher =
    filters.publisher !== "all" && filters.publisher !== OTHER_PUBLISHER_ID;
  const baseParams = {
    query: request.query,
    sort: request.sort,
    yearFrom: request.yearFrom,
    yearTo: request.yearTo,
    types: request.types,
    accessType: request.accessType,
    minCitations: request.minCitations,
    // Only predefined brands are pushed down to OpenAlex via publisher lineage.
    // "all" and bare "other" fetch from every publisher and filter client-side, so
    // the request is never restricted to the seven predefined publishers. A custom
    // publisher query pushes its resolved lineage ids instead for recall.
    publisher: isPredefinedPublisher ? filters.publisher : undefined,
    customPublisherIds:
      !isPredefinedPublisher && customPublisherIds.length > 0 ? customPublisherIds : undefined,
  };

  // Fast path: nothing left to verify client-side, so a single upstream page is exact.
  if (!hasVerificationFilters(filters) && !request.fetchAll) {
    const result = await searchPapers({ ...baseParams, page: request.page, perPage: request.perPage });
    const verified = await verifyPapers(result.papers, { resolveScopus });
    // Default "relevance" sort keeps the legacy high-priority order.
    // "best_match"/"quartile_desc" are computed client-side after verification.
    const sorted = applyClientSort(verified, request.sort);
    const papers = attachScoresIfNeeded(sorted, request.sort);
    const totalPages = Math.ceil(result.totalResults / request.perPage);

    return {
      papers,
      totalResults: result.totalResults,
      page: request.page,
      perPage: request.perPage,
      totalPages,
      facets: mergeFacets(result.facets, buildVerificationFacets(papers)),
      nextCursor: result.nextCursor,
      appliedFilters: filters,
      scannedCandidates: result.scanned,
      hasMoreResults: request.page < totalPages,
      scopusVerification,
    };
  }

  // Verified path: keep pulling upstream batches until enough verified matches exist.
  // Upstream stays paginated at BATCH_SIZE (the OpenAlex page cap); paging deeper
  // via cursor is how all available matches are retrieved instead of stopping at
  // the first page. Results are de-duplicated by id so cursor overlaps can never
  // surface the same paper twice.
  const perPage = request.fetchAll ? Math.max(request.perPage, BATCH_SIZE) : request.perPage;
  const needed = request.fetchAll ? Math.max(request.targetCount ?? 100, 1) : request.page * request.perPage;
  const matched: Paper[] = [];
  const matchedIds = new Set<string>();
  const scannedPapers: Paper[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  let batches = 0;
  let baseFacets: SearchFacets | null = null;
  let upstreamTotal = 0;
  let exhausted = false;

  while (matched.length < needed && batches < MAX_BATCHES && scanned < MAX_CANDIDATES) {
    const result = await searchPapers({ ...baseParams, page: 1, perPage: BATCH_SIZE, cursor });
    batches += 1;
    scanned += result.papers.length;
    if (!baseFacets) {
      baseFacets = result.facets;
      upstreamTotal = result.totalResults;
    }

    const verified = await verifyPapers(result.papers, { resolveScopus });
    scannedPapers.push(...verified);
    for (const paper of verified) {
      if (!matchesPaperFilters(paper, filters, customPublisherIds)) continue;
      if (matchedIds.has(paper.id)) continue;
      matchedIds.add(paper.id);
      matched.push(paper);
    }

    cursor = result.nextCursor || undefined;
    if (!cursor || result.papers.length === 0) {
      exhausted = true;
      break;
    }
  }

  const hasMoreResults = !exhausted && Boolean(cursor) && matched.length >= needed;
  const ranked = applyClientSort(matched, request.sort);
  const totalResults = ranked.length;
  const totalPages = hasMoreResults
    ? Math.ceil(totalResults / perPage) + 1
    : Math.ceil(totalResults / perPage);

  const pageSlice = request.fetchAll
    ? attachScoresIfNeeded(ranked, request.sort)
    : attachScoresIfNeeded(
        ranked.slice((request.page - 1) * request.perPage, request.page * request.perPage),
        request.sort
      );

  const verificationFacets = buildVerificationFacets(scannedPapers);

  return {
    papers: pageSlice,
    totalResults,
    page: request.fetchAll ? 1 : request.page,
    perPage: request.fetchAll ? pageSlice.length : request.perPage,
    totalPages: request.fetchAll ? 1 : totalPages,
    facets: mergeFacets(
      baseFacets ?? {
        typeCounts: {},
        accessCounts: { open: 0, restricted: 0 },
        yearCounts: {},
        sourceCounts: {},
        authorCounts: {},
      },
      verificationFacets
    ),
    nextCursor: null,
    appliedFilters: filters,
    scannedCandidates: scanned,
    hasMoreResults,
    scopusVerification,
    upstreamTotal,
  };
}
