import fs from "node:fs";
import path from "node:path";
import type {
  Paper,
  QuartileResult,
  QuartileTier,
  Source,
  VerificationEvidence,
} from "@/types";

/**
 * Journal quartile verification.
 *
 * A quartile is a property of a *journal in a subject category for a given year*
 * (SCImago SJR "best quartile" or Clarivate JCR quartile). It is never inferred
 * from a journal name, publisher, citation count, or keyword — doing so would
 * fabricate a ranking.
 *
 * Evidence sources, in priority order:
 *   1. Local verified registry (data/journal-quartiles.json), an ISSN-keyed list
 *      built from a SCImago / JCR export via scripts/build-quartile-registry.mjs.
 *      Only ISSNs present in the export receive a quartile.
 *   2. Live licensed/mirror API (opt-in, server-side only). There is no free
 *      official SCImago or JCR quartile API, so this layer only runs when the
 *      deployment configures one of:
 *        - JCR_API_KEY  -> Clarivate Journal Citation Reports API
 *        - QUARTILE_API_URL (+ optional QUARTILE_API_KEY) -> a generic
 *          institution-hosted mirror that answers GET {url}?issn={issn} with
 *          JSON { quartile: "Q1"|..., category?, year? }.
 *      Any non-200 / malformed / unauthenticated response falls through to
 *      "Quartile unavailable". Nothing is guessed from the failure.
 *   3. Otherwise: quartile = null ("Quartile unavailable").
 *
 * Journal-level metrics describe the venue, not the paper. Consumers must keep
 * the disclaimer: a Q1 venue does not make an individual paper superior.
 */

const REGISTRY_PATH = "data/journal-quartiles.json";
const REGISTRY_TTL_MS = 60_000;
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 4000;

export const QUARTILE_SCORES: Record<QuartileTier, number> = {
  Q1: 100,
  Q2: 75,
  Q3: 50,
  Q4: 25,
};

export function quartileScoreForTier(tier: QuartileTier | null | undefined): number | null {
  if (!tier) return null;
  return QUARTILE_SCORES[tier] ?? null;
}

interface QuartileRegistryEntry {
  quartile?: string;
  category?: string | null;
  year?: number | null;
  title?: string | null;
  provenance?: string | null;
}

interface QuartileRegistryFile {
  meta?: { source?: string; generatedAt?: string; entryCount?: number };
  quartiles?: Record<string, QuartileRegistryEntry>;
}

export interface QuartileVerifyOptions {
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected registry; defaults to data/journal-quartiles.json. */
  registry?: QuartileRegistryFile;
  /** Skips all network calls (used for fast paths and registry-only lookups). */
  allowNetwork?: boolean;
  /** Current year override (tests). */
  currentYear?: number;
}

let registryCache: { file: QuartileRegistryFile; loadedAt: number } | null = null;

function loadRegistryFromDisk(): QuartileRegistryFile {
  const now = Date.now();
  if (registryCache && now - registryCache.loadedAt < REGISTRY_TTL_MS) return registryCache.file;
  let file: QuartileRegistryFile = { quartiles: {} };
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), REGISTRY_PATH), "utf8");
    file = JSON.parse(raw) as QuartileRegistryFile;
  } catch {
    file = { quartiles: {} };
  }
  registryCache = { file, loadedAt: now };
  return file;
}

function getRegistry(options?: QuartileVerifyOptions): QuartileRegistryFile {
  if (options?.registry) return options.registry;
  return loadRegistryFromDisk();
}

export function getQuartileRegistryEntryCount(registry?: QuartileRegistryFile): number {
  return Object.keys(getRegistry({ registry }).quartiles ?? {}).length;
}

function getJcrApiKey(): string | null {
  const key = process.env.JCR_API_KEY || "";
  return key.trim() || null;
}

function getMirrorConfig(): { url: string; key: string | null } | null {
  const url = (process.env.QUARTILE_API_URL || "").trim().replace(/\/+$/, "");
  if (!url) return null;
  const key = (process.env.QUARTILE_API_KEY || "").trim() || null;
  return { url, key };
}

/** Tells the UI whether quartile verification has any backing source at all. */
export function getQuartileCapability(registry?: QuartileRegistryFile) {
  const entryCount = getQuartileRegistryEntryCount(registry);
  const hasLive = Boolean(getJcrApiKey() || getMirrorConfig());
  if (entryCount > 0 && hasLive) {
    return {
      method: "registry+live" as const,
      isAvailable: true,
      registryEntryCount: entryCount,
      detail: `Journal quartiles are verified against the local registry (${entryCount.toLocaleString()} ISSNs) with a live licensed/mirror API as fallback.`,
    };
  }
  if (entryCount > 0) {
    return {
      method: "quartile-registry" as const,
      isAvailable: true,
      registryEntryCount: entryCount,
      detail: `Journal quartiles are verified against the local registry (${entryCount.toLocaleString()} ISSNs). Configure JCR_API_KEY or QUARTILE_API_URL for live fallback.`,
    };
  }
  if (hasLive) {
    return {
      method: "live" as const,
      isAvailable: true,
      registryEntryCount: 0,
      detail: "Journal quartiles are verified through the configured live quartile API.",
    };
  }
  return {
    method: "none" as const,
    isAvailable: false,
    registryEntryCount: 0,
    detail:
      "Journal quartile verification is not configured: empty local registry and no live quartile API. Every paper is reported as Quartile unavailable. Run npm run quartile:registry -- <scimago-or-jcr-export.csv> to enable verification.",
  };
}

function cleanIssn(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toUpperCase().replace(/[^0-9X]/g, "");
  return /^\d{7}[\dX]$/.test(cleaned) ? cleaned : null;
}

function issnCandidates(source: Source | null): string[] {
  if (!source) return [];
  const candidates = [source.issnL, ...(source.issnList ?? []), source.issn]
    .map(cleanIssn)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(candidates));
}

export function normalizeQuartileTier(value: unknown): QuartileTier | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase().replace(/\s+/g, "");
  if (v === "Q1" || v === "QUARTILE1" || v === "1") return "Q1";
  if (v === "Q2" || v === "QUARTILE2" || v === "2") return "Q2";
  if (v === "Q3" || v === "QUARTILE3" || v === "3") return "Q3";
  if (v === "Q4" || v === "QUARTILE4" || v === "4") return "Q4";
  return null;
}

function unavailable(reason: string): QuartileResult {
  return {
    quartile: null,
    label: "Quartile unavailable",
    category: null,
    year: null,
    provenance: null,
    method: "none",
    checkedAt: new Date().toISOString(),
    confidence: "unknown",
    evidence: [],
    reason,
  };
}

function verified(
  tier: QuartileTier,
  evidence: VerificationEvidence[],
  method: QuartileResult["method"],
  opts: { category?: string | null; year?: number | null; provenance?: string | null }
): QuartileResult {
  return {
    quartile: tier,
    label: tier,
    category: opts.category ?? null,
    year: typeof opts.year === "number" && Number.isFinite(opts.year) ? opts.year : null,
    provenance: opts.provenance ?? null,
    method,
    checkedAt: new Date().toISOString(),
    confidence: "verified",
    evidence,
    reason: null,
  };
}

/** Cached quartile lookups, keyed by the identifier that was actually queried. */
const resultCache = new Map<string, { value: QuartileResult; expiresAt: number }>();

function readCache(key: string): QuartileResult | null {
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    resultCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: QuartileResult): void {
  if (resultCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = resultCache.keys().next().value;
    if (oldest !== undefined) resultCache.delete(oldest);
  }
  resultCache.set(key, { value, expiresAt: Date.now() + RESULT_TTL_MS });
}

/**
 * Generic mirror lookup. Expected contract (documented in .env.example):
 *   GET {mirrorUrl}?issn={8-digit ISSN}  [+ Authorization: Bearer {key}]
 *   -> 200 { "quartile": "Q1", "category": "...", "year": 2024 }
 * Anything else (404/401/429/5xx/malformed) returns null = inconclusive.
 */
async function mirrorLookupByIssn(
  issn: string,
  options: QuartileVerifyOptions
): Promise<QuartileResult | null> {
  const mirror = getMirrorConfig();
  if (!mirror) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${mirror.url}?issn=${encodeURIComponent(issn)}`;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        ...(mirror.key ? { Authorization: `Bearer ${mirror.key}` } : {}),
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      quartile?: unknown;
      category?: unknown;
      year?: unknown;
      provenance?: unknown;
    };
    const tier = normalizeQuartileTier(data?.quartile);
    if (!tier) return null;
    const year =
      typeof data?.year === "number" && Number.isFinite(data.year)
        ? Math.trunc(data.year)
        : typeof data?.year === "string" && /^\d{4}$/.test(data.year.trim())
          ? Number(data.year.trim())
          : null;
    return verified(
      tier,
      [
        {
          field: "source.issn",
          source: "scopus-source-registry",
          detail: `Mirror quartile API returned ${tier} for ISSN ${issn}.`,
          url,
        },
      ],
      "sjr-mirror",
      {
        category: typeof data?.category === "string" ? data.category : null,
        year,
        provenance: typeof data?.provenance === "string" ? data.provenance : "mirror API",
      }
    );
  } catch {
    return null;
  }
}

/**
 * Clarivate JCR lookup (requires a subscription key). Journal endpoint answers
 * per-ISSN journal records carrying a quartile; any failure is inconclusive.
 */
async function jcrLookupByIssn(
  issn: string,
  options: QuartileVerifyOptions
): Promise<QuartileResult | null> {
  const apiKey = getJcrApiKey();
  if (!apiKey) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  // Clarivate Journals API: https://api.clarivate.com/apis/journal-citation-reports/v1/journals
  const url = `https://api.clarivate.com/apis/journal-citation-reports/v1/journals?issn=${encodeURIComponent(issn)}`;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "X-ApiKey": apiKey },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      data?: Array<{
        quartile?: unknown;
        category?: unknown;
        year?: unknown;
        journalName?: unknown;
      }>;
    };
    const record = data?.data?.[0];
    const tier = normalizeQuartileTier(record?.quartile);
    if (!tier) return null;
    const year =
      typeof record?.year === "number" && Number.isFinite(record.year)
        ? Math.trunc(record.year)
        : null;
    return verified(
      tier,
      [
        {
          field: "source.issn",
          source: "scopus-source-registry",
          detail: `Clarivate JCR API returned ${tier} for ISSN ${issn}.`,
          url,
        },
      ],
      "jcr-api",
      {
        category: typeof record?.category === "string" ? record.category : null,
        year,
        provenance: "Clarivate JCR",
      }
    );
  } catch {
    return null;
  }
}

/**
 * Verify the journal quartile for a paper via ISSN join only.
 * Returns quartile=null ("Quartile unavailable") whenever no verified source
 * can confirm a quartile. Never guesses from title, publisher, or citations.
 */
export async function verifyQuartile(
  paper: Pick<Paper, "source">,
  options: QuartileVerifyOptions = {}
): Promise<QuartileResult> {
  const issns = issnCandidates(paper.source);
  const registry = getRegistry(options);
  const entries = registry.quartiles ?? {};
  const allowNetwork = options.allowNetwork !== false;

  // Local registry first: free, deterministic, needs no network.
  for (const issn of issns) {
    const entry = entries[issn];
    const tier = normalizeQuartileTier(entry?.quartile);
    if (tier) {
      return verified(
        tier,
        [
          {
            field: "source.issn",
            source: "scopus-source-registry",
            detail: `ISSN ${issn} is listed in the local quartile registry as ${tier}${entry?.category ? ` (${entry.category})` : ""}${entry?.year ? ` for ${entry.year}` : ""}.`,
          },
        ],
        "quartile-registry",
        {
          category: entry?.category ?? null,
          year: typeof entry?.year === "number" ? entry.year : null,
          provenance: entry?.provenance ?? registry.meta?.source ?? "local registry",
        }
      );
    }
  }

  if (allowNetwork && (getJcrApiKey() || getMirrorConfig())) {
    for (const issn of issns) {
      const cacheKey = `quartile:${issn}`;
      const cached = readCache(cacheKey);
      if (cached) return cached;
      const live = (await jcrLookupByIssn(issn, options)) ?? (await mirrorLookupByIssn(issn, options));
      if (live) {
        writeCache(cacheKey, live);
        return live;
      }
    }
  }

  if (issns.length === 0) {
    return unavailable(
      "No ISSN metadata is available for this record, so no quartile registry or API lookup is possible. Journal name and publisher are never used to guess a quartile."
    );
  }
  const capability = getQuartileCapability();
  return unavailable(
    capability.isAvailable
      ? `No verified quartile was found for ISSN ${issns.join("/")} in the configured sources. The paper stays visible; only its quartile-dependent score component is skipped.`
      : "Journal quartile verification is not configured (empty local registry and no live quartile API), so no quartile can be confirmed. Journal name, publisher and citations are never used to guess a quartile."
  );
}

export function clearQuartileCaches(): void {
  resultCache.clear();
  registryCache = null;
}

export function summarizeQuartileCounts(results: Pick<Paper, "quartile">[]): {
  Q1: number;
  Q2: number;
  Q3: number;
  Q4: number;
  unranked: number;
} {
  const counts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, unranked: 0 };
  for (const paper of results) {
    const q = paper.quartile?.quartile;
    if (q === "Q1" || q === "Q2" || q === "Q3" || q === "Q4") counts[q] += 1;
    else counts.unranked += 1;
  }
  return counts;
}
