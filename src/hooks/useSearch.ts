"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Paper, SearchFacets, ScopusVerificationCapability } from "@/types";

export interface SearchState {
  query: string;
  page: number;
  perPage: number;
  sort: string;
  yearFrom: number | null;
  yearTo: number | null;
  types: string[];
  accessType: string;
  minCitations: number | null;
  publisher: string;
  publisherQuery: string;
  scopusOnly: boolean;
  publishedOnly: boolean;
  quartiles: string[];
}

interface SearchResult {
  results: Paper[];
  totalResults: number;
  totalPages: number;
  facets: SearchFacets;
  isLoading: boolean;
  error: string | null;
  scannedCandidates: number;
  hasMoreResults: boolean;
  upstreamTotal: number | null;
  scopusVerification: ScopusVerificationCapability | null;
}

const initialFacets: SearchFacets = {
  typeCounts: {}, accessCounts: { open: 0, restricted: 0 }, yearCounts: {}, sourceCounts: {}, authorCounts: {},
};

const parseBooleanParam = (value: string | null): boolean => value === "true" || value === "1";

/** Statuses worth retrying: the upstream throttled us, or it was briefly unavailable. */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_CLIENT_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 45_000;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function readRetryAfterSeconds(response: Response, payload: SearchErrorPayload | null): number {
  const header = response.headers.get("Retry-After");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  }
  if (payload?.retryAfterSeconds !== undefined) return payload.retryAfterSeconds;
  return 3;
}

interface SearchErrorPayload {
  error?: string;
  details?: string;
  retryAfterSeconds?: number;
  openAlexKeyConfigured?: boolean;
}

/**
 * Runs the search, retrying a throttled or briefly unavailable upstream. Without this the
 * first OpenAlex 429 surfaced to the user as a dead "Search failed" box even though the
 * search would have succeeded a few seconds later.
 */
async function requestSearch(
  params: URLSearchParams,
  signal: AbortSignal
): Promise<{ data: SearchResponse }> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`/api/papers/search?${params.toString()}`, { signal });
    if (response.ok) return { data: (await response.json()) as SearchResponse };

    let payload: SearchErrorPayload | null = null;
    try {
      payload = (await response.json()) as SearchErrorPayload;
    } catch {
      // Non-JSON body (proxy error page, empty body): fall back to the status text.
    }

    if (attempt >= MAX_CLIENT_ATTEMPTS || !RETRYABLE_STATUS.has(response.status)) {
      const message = payload?.error || `Search failed (HTTP ${response.status})`;
      const error = new Error(message) as Error & {
        details?: string; retryable: boolean; status?: number; openAlexKeyConfigured?: boolean;
      };
      error.details = payload?.details;
      error.retryable = RETRYABLE_STATUS.has(response.status);
      error.status = response.status;
      error.openAlexKeyConfigured = payload?.openAlexKeyConfigured;
      throw error;
    }

    const waitMs = Math.min(readRetryAfterSeconds(response, payload) * 1000 + 250, MAX_RETRY_WAIT_MS);
    await sleep(waitMs, signal);
  }
}

interface SearchResponse {
  results?: Paper[];
  totalResults?: number;
  totalPages?: number;
  facets?: SearchFacets;
  scannedCandidates?: number;
  hasMoreResults?: boolean;
  upstreamTotal?: number;
  scopusVerification?: ScopusVerificationCapability;
}

export function useSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const abortControllerRef = useRef<AbortController | null>(null);

  const [searchState, setSearchState] = useState<SearchState>({
    query: searchParams.get("q") || "",
    page: parseInt(searchParams.get("page") || "1", 10),
    perPage: parseInt(searchParams.get("perPage") || "25", 10),
    sort: searchParams.get("sort") || "relevance",
    yearFrom: searchParams.get("yearFrom") ? parseInt(searchParams.get("yearFrom")!, 10) : null,
    yearTo: searchParams.get("yearTo") ? parseInt(searchParams.get("yearTo")!, 10) : null,
    types: searchParams.get("types") ? searchParams.get("types")!.split(",").filter(Boolean) : [],
    accessType: searchParams.get("accessType") || "all",
    minCitations: searchParams.get("minCitations") ? parseInt(searchParams.get("minCitations")!, 10) : null,
    publisher: searchParams.get("publisher") || "all",
    publisherQuery: searchParams.get("publisherQuery") || "",
    scopusOnly: parseBooleanParam(searchParams.get("scopusOnly")),
    publishedOnly: parseBooleanParam(searchParams.get("publishedOnly")),
    quartiles: searchParams.get("quartiles") ? searchParams.get("quartiles")!.split(",").filter(Boolean) : [],
  });

  const [result, setResult] = useState<SearchResult>({
    results: [], totalResults: 0, totalPages: 0, facets: initialFacets, isLoading: false, error: null,
    scannedCandidates: 0, hasMoreResults: false, upstreamTotal: null, scopusVerification: null,
  });

  const buildUrl = useCallback((state: SearchState) => {
    const params = new URLSearchParams();
    params.set("q", state.query);
    if (state.page > 1) params.set("page", state.page.toString());
    if (state.perPage !== 25) params.set("perPage", state.perPage.toString());
    if (state.sort !== "relevance") params.set("sort", state.sort);
    if (state.yearFrom) params.set("yearFrom", state.yearFrom.toString());
    if (state.yearTo) params.set("yearTo", state.yearTo.toString());
    if (state.types.length > 0) params.set("types", state.types.join(","));
    if (state.accessType !== "all") params.set("accessType", state.accessType);
    if (state.minCitations) params.set("minCitations", state.minCitations.toString());
    if (state.publisher && state.publisher !== "all") params.set("publisher", state.publisher);
    if (state.publisherQuery && state.publisherQuery.trim()) params.set("publisherQuery", state.publisherQuery.trim());
    if (state.scopusOnly) params.set("scopusOnly", "true");
    if (state.publishedOnly) params.set("publishedOnly", "true");
    if (state.quartiles.length > 0) params.set("quartiles", state.quartiles.join(","));
    return `/search?${params.toString()}`;
  }, []);

  const fetchResults = useCallback(async (state: SearchState) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setResult((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const params = new URLSearchParams();
      params.set("query", state.query);
      params.set("page", state.page.toString());
      params.set("perPage", state.perPage.toString());
      params.set("sort", state.sort);
      if (state.yearFrom) params.set("yearFrom", state.yearFrom.toString());
      if (state.yearTo) params.set("yearTo", state.yearTo.toString());
      if (state.types.length > 0) params.set("types", state.types.join(","));
      if (state.accessType !== "all") params.set("accessType", state.accessType);
      if (state.minCitations) params.set("minCitations", state.minCitations.toString());
      if (state.publisher && state.publisher !== "all") params.set("publisher", state.publisher);
      if (state.publisherQuery && state.publisherQuery.trim()) params.set("publisherQuery", state.publisherQuery.trim());
      if (state.scopusOnly) params.set("scopusOnly", "true");
      if (state.publishedOnly) params.set("publishedOnly", "true");
      if (state.quartiles.length > 0) params.set("quartiles", state.quartiles.join(","));

      const { data } = await requestSearch(params, controller.signal);

      setResult({
        results: data.results || [],
        totalResults: data.totalResults || 0,
        totalPages: data.totalPages || 0,
        facets: data.facets || initialFacets,
        isLoading: false,
        error: null,
        scannedCandidates: data.scannedCandidates || 0,
        hasMoreResults: data.hasMoreResults === true,
        upstreamTotal: typeof data.upstreamTotal === "number" ? data.upstreamTotal : null,
        scopusVerification: data.scopusVerification || null,
      });
    } catch (error) {
      if (isAbortError(error)) return;
      const failed = error as Error & {
        details?: string; retryable?: boolean; status?: number; openAlexKeyConfigured?: boolean;
      };
      // Keep the real reason (e.g. "rate-limited by OpenAlex") visible, and hint at the
      // fix when a free OpenAlex key would stop the throttling entirely.
      const base = failed.message || "An error occurred";
      const withDetail = failed.details && !base.includes(failed.details)
        ? `${base} (${failed.details})`
        : base;
      // A 429/503 without a server-side API key means the provider is refusing
      // anonymous traffic — retrying alone will not fix it. Spell out the
      // remediation so the error box is self-solving. With a key configured it is
      // just a transient provider blip, so say that instead.
      const hint = failed.status === 429 || failed.status === 503
        ? failed.openAlexKeyConfigured === true
          ? " The server has an OpenAlex key configured, so this is a temporary provider blip — wait a minute and use Try Again."
          : " Fix: get a free key at openalex.org/settings/api, set OPENALEX_API_KEY in .env.local, then restart the server (npm run dev). Requests without a key run in the throttled anonymous pool."
        : failed.retryable
          ? " OpenAlex is throttling anonymous searches — a free OPENALEX_API_KEY removes this."
          : "";
      setResult((prev) => ({ ...prev, isLoading: false, error: `${withDetail}.${hint}` }));
    }
  }, []);

  const updateSearch = useCallback((updates: Partial<SearchState>) => {
    setSearchState((prev) => {
      // Any change to the query or to a filter returns to the first page.
      const filterKeys: (keyof SearchState)[] = [
        "query", "types", "accessType", "yearFrom", "yearTo", "minCitations",
        "publisher", "publisherQuery", "scopusOnly", "publishedOnly", "quartiles",
      ];
      const filterChanged = filterKeys.some(
        (key) => updates[key] !== undefined && updates[key] !== prev[key]
      );
      return { ...prev, ...updates, page: filterChanged ? 1 : updates.page ?? prev.page };
    });
  }, []);

  const setPage = useCallback((page: number) => {
    setSearchState((prev) => {
      const newState = { ...prev, page };
      return newState;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearchState((prev) => ({
      query: prev.query, page: 1, perPage: 25, sort: "relevance",
      yearFrom: null, yearTo: null, types: [], accessType: "all", minCitations: null,
      publisher: "all", publisherQuery: "", scopusOnly: false, publishedOnly: false, quartiles: [],
    }));
  }, []);

  const isInitialMount = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const isFirstRun = isInitialMount.current;
    isInitialMount.current = false;
    if (!searchState.query) return;
    // The URL already reflects the query on the first run; only later changes push.
    if (!isFirstRun) router.push(buildUrl(searchState));

    // Deferred by a microtask so the loading flag is not flipped synchronously in the
    // effect body, which would cost an extra render pass before the request even
    // starts. The id guard drops superseded runs so only the latest state is fetched.
    const requestId = (requestIdRef.current += 1);
    void Promise.resolve().then(() => {
      if (requestIdRef.current === requestId) fetchResults(searchState);
    });
  }, [searchState, router, buildUrl, fetchResults]);

  return { searchState, result, updateSearch, setPage, clearFilters, buildUrl };
}
