import fs from "node:fs";
import path from "node:path";
import type { Paper, ScopusResult, ScopusStatus, Source, VerificationEvidence } from "@/types";

/**
 * Scopus verification.
 *
 * Scopus coverage is a property of a *source* (a journal or conference title) and of
 * individual documents. It is never inferred from a journal name, DOI prefix, publisher
 * or keyword — doing so would fabricate coverage.
 *
 * Evidence sources, in priority order:
 *   1. Elsevier Scopus APIs (authoritative, requires SCOPUS_API_KEY):
 *      - ISSN title lookup  GET /content/serial/title/issn/{issn}
 *      - document lookup    GET /content/search/scopus?query=DOI({doi})
 *      200 => Indexed. 404 / zero results => Not indexed (authoritative negative).
 *      401 / 403 / 429 / 5xx / network error => inconclusive, falls through to Unknown.
 *   2. Local Scopus source registry (data/scopus-sources.json), an ISSN-keyed list built
 *      from a Scopus-derived export by scripts/build-scopus-registry.mjs. Only contains
 *      sources that are actually in Scopus.
 *   3. A venue that OpenAlex classifies as a preprint repository is not a Scopus source.
 *   4. Otherwise: Unknown. Never "Indexed".
 *
 * Note: OpenAlex itself cannot confirm Scopus coverage — its `indexed_in` field only
 * contains arxiv, crossref, datacite, doaj and pubmed (verified against /indexes), and
 * the former `sources.is_indexed_in_scopus` flag is no longer returned by the API.
 */
const SCOPUS_API_BASE = "https://api.elsevier.com/content";
const REGISTRY_PATH = "data/scopus-sources.json";
const REGISTRY_TTL_MS = 60_000;
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 4000;

interface ScopusRegistryEntry {
  title?: string;
  publisher?: string;
  scopusSourceId?: string;
}

interface ScopusRegistryFile {
  meta?: { source?: string; generatedAt?: string; entryCount?: number };
  sources?: Record<string, ScopusRegistryEntry>;
}

export interface ScopusVerifyOptions {
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected registry; defaults to data/scopus-sources.json. */
  registry?: ScopusRegistryFile;
  /** Skips all network calls (used for fast paths and for registry-only lookups). */
  allowNetwork?: boolean;
}

let registryCache: { file: ScopusRegistryFile; loadedAt: number } | null = null;

function loadRegistryFromDisk(): ScopusRegistryFile {
  const now = Date.now();
  if (registryCache && now - registryCache.loadedAt < REGISTRY_TTL_MS) return registryCache.file;
  let file: ScopusRegistryFile = { sources: {} };
  try {
    // Server-side only: read the ISSN-keyed Scopus source list shipped with the app.
    const raw = fs.readFileSync(path.join(process.cwd(), REGISTRY_PATH), "utf8");
    file = JSON.parse(raw) as ScopusRegistryFile;
  } catch {
    file = { sources: {} };
  }
  registryCache = { file, loadedAt: now };
  return file;
}

function getRegistry(options?: ScopusVerifyOptions): ScopusRegistryFile {
  if (options?.registry) return options.registry;
  return loadRegistryFromDisk();
}

export function getRegistryEntryCount(registry?: ScopusRegistryFile): number {
  return Object.keys(getRegistry({ registry }).sources ?? {}).length;
}

export function getScopusApiKey(): string | null {
  const key = process.env.SCOPUS_API_KEY || process.env.ELSEVIER_API_KEY || "";
  return key.trim() || null;
}

/** Tells the UI whether Scopus coverage can be verified at all in this deployment. */
export function getScopusCapability(registry?: ScopusRegistryFile) {
  const apiKey = getScopusApiKey();
  const entryCount = getRegistryEntryCount(registry);
  if (apiKey) {
    return {
      method: "scopus-api" as const,
      isAvailable: true,
      registryEntryCount: entryCount,
      detail: "Scopus coverage is verified live through the Elsevier Scopus API (SCOPUS_API_KEY configured).",
    };
  }
  if (entryCount > 0) {
    return {
      method: "scopus-source-registry" as const,
      isAvailable: true,
      registryEntryCount: entryCount,
      detail: `Scopus coverage is verified against the local Scopus source list (${entryCount.toLocaleString()} sources).`,
    };
  }
  return {
    method: "none" as const,
    isAvailable: false,
    registryEntryCount: 0,
    detail:
      "Scopus coverage cannot be verified in this deployment: no SCOPUS_API_KEY and an empty local Scopus source list. Every paper is reported as Scopus: Unknown.",
  };
}

function cleanIssn(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toUpperCase().replace(/[^0-9X]/g, "");
  return /^\d{7}[\dX]$/.test(cleaned) ? cleaned : null;
}

/**
 * OpenAlex reports DOIs as resolvable URLs (https://doi.org/10.1038/nature14539) and
 * sometimes bare. The Scopus `DOI(...)` operator only matches the bare form, so a URL is
 * silently accepted by the API and answered with totalResults = 0 — which the caller would
 * read as an authoritative "not indexed". Strip the prefixes before querying.
 */
export function normalizeDoi(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").trim();
  if (!/^10\.\d{4,9}\//.test(withoutPrefix)) return null;
  return withoutPrefix;
}

function issnCandidates(source: Source | null): string[] {
  if (!source) return [];
  const candidates = [source.issnL, ...(source.issnList ?? []), source.issn]
    .map(cleanIssn)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(candidates));
}

function unknown(reason: string, method: ScopusResult["method"] = "none"): ScopusResult {
  return {
    status: "unknown",
    label: "Unknown",
    method,
    checkedAt: new Date().toISOString(),
    confidence: "unknown",
    evidence: [],
    reason,
  };
}

function notIndexed(
  reason: string,
  evidence: VerificationEvidence[],
  method: ScopusResult["method"]
): ScopusResult {
  return {
    status: "not-indexed",
    label: "Not Indexed",
    method,
    checkedAt: new Date().toISOString(),
    confidence: "verified",
    evidence,
    reason,
  };
}

function indexed(
  evidence: VerificationEvidence[],
  method: ScopusResult["method"]
): ScopusResult {
  return {
    status: "indexed",
    label: "Indexed",
    method,
    checkedAt: new Date().toISOString(),
    confidence: "verified",
    evidence,
    reason: null,
  };
}

function isPreprintServer(source: Source | null): boolean {
  if (!source || source.type !== "repository") return false;
  const name = (source.hostOrganizationName || source.displayName || "").toLowerCase();
  return ["arxiv", "biorxiv", "medrxiv", "chemrxiv", "psyarxiv", "ssrn", "research square", "preprints.org"].some((token) =>
    name.includes(token)
  );
}

/** Cached Scopus lookups, keyed by the identifier that was actually queried. */
const resultCache = new Map<string, { value: ScopusResult; expiresAt: number }>();

function readCache(key: string): ScopusResult | null {
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    resultCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: ScopusResult): void {
  if (resultCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = resultCache.keys().next().value;
    if (oldest !== undefined) resultCache.delete(oldest);
  }
  resultCache.set(key, { value, expiresAt: Date.now() + RESULT_TTL_MS });
}

async function scopusTitleByIssn(issn: string, options: ScopusVerifyOptions): Promise<ScopusResult | null> {
  const apiKey = getScopusApiKey();
  if (!apiKey) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${SCOPUS_API_BASE}/serial/title/issn/${encodeURIComponent(issn)}?httpAccept=application/json`;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "X-ELS-APIKey": apiKey },
    });
    if (response.status === 404) {
      return notIndexed(
        `The Elsevier Scopus API has no source title for ISSN ${issn}.`,
        [{ field: "serial-title.issn", source: "scopus-api", detail: `Scopus serial title lookup returned 404 for ISSN ${issn}.`, url }],
        "scopus-api"
      );
    }
    if (!response.ok) return null;
    // The serial title endpoint returns a `serial-metadata-response` envelope whose entry
    // holds `prism:issn`, `dc:title` and `coverageStartYear`.
    const data = (await response.json()) as {
      "serial-metadata-response"?: {
        entry?: Array<{
          "dc:title"?: string;
          "prism:issn"?: string;
          "prism:eIssn"?: string;
          coverageStartYear?: string;
        }>;
      };
      "serial-title"?: { issn?: string; title?: string; coverageStartYear?: string };
    };
    const title =
      data?.["serial-metadata-response"]?.entry?.[0] ??
      (data?.["serial-title"] ? { "dc:title": data["serial-title"].title, "prism:issn": data["serial-title"].issn, coverageStartYear: data["serial-title"].coverageStartYear } : undefined);
    if (!title?.["prism:issn"]) return null;
    return indexed(
      [
        {
          field: "serial-title.issn",
          source: "scopus-api",
          detail: `Elsevier Scopus API returned the source title "${title["dc:title"] ?? "unknown"}" for ISSN ${title["prism:issn"]}${
            title.coverageStartYear ? ` (coverage from ${title.coverageStartYear})` : ""
          }.`,
          url,
        },
      ],
      "scopus-api"
    );
  } catch {
    return null;
  }
}

async function scopusDocumentByDoi(doi: string, options: ScopusVerifyOptions): Promise<ScopusResult | null> {
  const apiKey = getScopusApiKey();
  if (!apiKey) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${SCOPUS_API_BASE}/search/scopus?query=${encodeURIComponent(`DOI(${doi})`)}&count=1&httpAccept=application/json`;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "X-ELS-APIKey": apiKey },
    });
    if (response.status === 404) {
      return notIndexed(
        `The Elsevier Scopus API returned no document for DOI ${doi}.`,
        [{ field: "prism:doi", source: "scopus-api", detail: `Scopus document search returned 404 for DOI ${doi}.`, url }],
        "scopus-api"
      );
    }
    if (!response.ok) return null;
    const data = (await response.json()) as {
      "search-results"?: {
        "opensearch:totalResults"?: string;
        totalResults?: string;
        entry?: Array<{ "dc:identifier"?: string; "prism:doi"?: string; "dc:title"?: string }>;
      };
    };
    const results = data?.["search-results"];
    const rawTotal = results?.["opensearch:totalResults"] ?? results?.totalResults;
    if (rawTotal === undefined) return null;
    const total = Number(rawTotal);
    const entry = results?.entry?.[0];
    if (Number.isFinite(total) && total > 0 && entry) {
      return indexed(
        [
          {
            field: "prism:doi",
            source: "scopus-api",
            detail: `Elsevier Scopus API found ${total} document(s) for DOI ${doi}${
              entry["dc:identifier"] ? ` (Scopus EID ${entry["dc:identifier"]})` : ""
            }.`,
            url,
          },
        ],
        "scopus-api"
      );
    }
    if (Number.isFinite(total)) {
      return notIndexed(
        `The Elsevier Scopus API returned 0 documents for DOI ${doi}.`,
        [{ field: "prism:doi", source: "scopus-api", detail: `Scopus document search returned totalResults = 0 for DOI ${doi}.`, url }],
        "scopus-api"
      );
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify whether a paper is indexed in Scopus.
 * Returns `unknown` whenever no authoritative source can confirm or deny coverage.
 */
export async function verifyScopusIndexing(
  paper: Pick<Paper, "doi" | "source" | "type">,
  options: ScopusVerifyOptions = {}
): Promise<ScopusResult> {
  const issns = issnCandidates(paper.source);
  const doi = normalizeDoi(paper.doi);
  const registry = getRegistry(options);
  const registrySources = registry.sources ?? {};
  const allowNetwork = options.allowNetwork !== false;

  // Local registry first: it is free, deterministic and needs no network access.
  for (const issn of issns) {
    const entry = registrySources[issn];
    if (entry) {
      return indexed(
        [
          {
            field: "source.issn",
            source: "scopus-source-registry",
            detail: `ISSN ${issn} is listed in the local Scopus source list${
              entry.title ? ` ("${entry.title}")` : ""
            }${entry.publisher ? `, published by ${entry.publisher}` : ""}.`,
          },
        ],
        "scopus-source-registry"
      );
    }
  }

  if (allowNetwork && getScopusApiKey()) {
    for (const issn of issns) {
      const cacheKey = `issn:${issn}`;
      const cached = readCache(cacheKey);
      if (cached) return cached;
      const value = await scopusTitleByIssn(issn, options);
      if (value) {
        writeCache(cacheKey, value);
        return value;
      }
    }

    if (doi) {
      const cacheKey = `doi:${doi.toLowerCase()}`;
      const cached = readCache(cacheKey);
      if (cached) return cached;
      const value = await scopusDocumentByDoi(doi, options);
      if (value) {
        writeCache(cacheKey, value);
        return value;
      }
    }
  }

  // A preprint server is not a Scopus source. Only conclusive without a DOI/venue.
  if (!doi && isPreprintServer(paper.source)) {
    return notIndexed(
      `"${paper.source?.displayName ?? "This server"}" is a preprint repository, not a Scopus source.`,
      [
        {
          field: "source.type",
          source: "openalex",
          detail: `OpenAlex classifies the source as a repository (${paper.source?.displayName}).`,
        },
      ],
      "preprint-repository"
    );
  }

  const reason = getScopusCapability().isAvailable
    ? `Scopus coverage could not be confirmed for ${issns.length > 0 ? `ISSN ${issns.join("/")}` : "this record"} and DOI ${doi ?? "(none)"}; the verification sources did not return a definitive answer.`
    : `No Scopus verification source is configured (no SCOPUS_API_KEY and an empty local Scopus source list), so coverage cannot be confirmed. Journal name, publisher and keywords are never used to guess Scopus indexing.`;

  return unknown(reason);
}

export function clearScopusCaches(): void {
  resultCache.clear();
  registryCache = null;
}

export function summarizeScopusCounts(results: Pick<Paper, "scopus">[]): {
  indexed: number;
  "not-indexed": number;
  unknown: number;
} {
  const counts = { indexed: 0, "not-indexed": 0, unknown: 0 };
  for (const paper of results) {
    const status: ScopusStatus = paper.scopus?.status ?? "unknown";
    counts[status] += 1;
  }
  return counts;
}
