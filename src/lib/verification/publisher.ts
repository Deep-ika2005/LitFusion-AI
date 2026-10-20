import type { Paper, PublisherResult, Source, VerificationEvidence } from "@/types";

/**
 * Publisher verification.
 *
 * A publisher is only ever derived from authoritative bibliographic metadata:
 *   1. OpenAlex publisher lineage (`source.host_organization_lineage`) — the publisher
 *      entity (and its ancestors) that OpenAlex/Crossref assigns to the venue.
 *   2. The publisher legal entity name (`source.host_organization_name`).
 *   3. Crossref `publisher` for the DOI, used only when OpenAlex has no publisher metadata.
 *
 * Titles, keywords and journal display names are never used to infer a publisher:
 * a journal called "IEEE Access" published by another host organization is reported
 * with that host organization.
 */
export interface PublisherDefinition {
  id: string;
  name: string;
  /** OpenAlex publisher ids. Filtering by the root id also matches its child imprints. */
  openAlexPublisherIds: string[];
  /** Exact (case-insensitive) host organization names, used when lineage ids are missing. */
  hostOrganizationAliases: string[];
  website: string;
}

export const PUBLISHERS: PublisherDefinition[] = [
  {
    id: "ieee",
    name: "IEEE",
    openAlexPublisherIds: ["P4310319808"],
    hostOrganizationAliases: [
      "institute of electrical and electronics engineers",
      "ieee",
      "ieee computer society",
      "ieee communications society",
      "ieee signal processing society",
      "ieee power & energy society",
      "ieee power and energy society",
      "ieee control systems society",
      "ieee robotics and automation society",
      "ieee industrial electronics society",
      "ieee computational intelligence society",
      "ieee photonics society",
      "ieee antennas & propagation society",
      "ieee antennas and propagation society",
      "ieee electron devices society",
    ],
    website: "https://www.ieee.org",
  },
  {
    id: "springer",
    name: "Springer",
    openAlexPublisherIds: ["P4310319965"],
    hostOrganizationAliases: [
      "springer nature",
      "springer verlag",
      "springer science+business media",
      "springer nature (netherlands)",
      "springer, singapore",
      "springer-verlag",
    ],
    website: "https://www.springernature.com",
  },
  {
    id: "elsevier",
    name: "Elsevier",
    openAlexPublisherIds: ["P4310320990"],
    hostOrganizationAliases: ["elsevier", "elsevier bv", "elsevier ltd", "elsevier science ltd"],
    website: "https://www.elsevier.com",
  },
  {
    id: "acm",
    name: "ACM",
    openAlexPublisherIds: ["P4310319798"],
    hostOrganizationAliases: ["association for computing machinery", "acm", "acm digital library"],
    website: "https://www.acm.org",
  },
  {
    id: "wiley",
    name: "Wiley",
    openAlexPublisherIds: ["P4310320595"],
    hostOrganizationAliases: [
      "wiley",
      "john wiley & sons",
      "john wiley and sons",
      "wiley-blackwell",
      "wiley/blackwell",
    ],
    website: "https://www.wiley.com",
  },
  {
    id: "mdpi",
    name: "MDPI",
    openAlexPublisherIds: ["P4310310987"],
    hostOrganizationAliases: [
      "mdpi",
      "mdpi ag",
      "mdpi s.a.",
      "multidisciplinary digital publishing institute",
      "multidisciplinary digital publishing institute ag",
    ],
    website: "https://www.mdpi.com",
  },
  {
    id: "taylor-and-francis",
    name: "Taylor & Francis",
    openAlexPublisherIds: ["P4310320547"],
    hostOrganizationAliases: [
      "taylor & francis",
      "taylor and francis",
      "taylor & francis group",
      "taylor & francis inc",
      "taylor & francis group taylor & francis inc",
    ],
    website: "https://www.tandfonline.com",
  },
];

const PUBLISHER_BY_ID = new Map(PUBLISHERS.map((p) => [p.id, p]));

function normalizeName(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const ALIAS_TO_PUBLISHER = new Map<string, PublisherDefinition>();
for (const publisher of PUBLISHERS) {
  for (const alias of publisher.hostOrganizationAliases) {
    ALIAS_TO_PUBLISHER.set(normalizeName(alias), publisher);
  }
}

const PUBLISHER_ID_SETS = PUBLISHERS.map((p) => ({
  publisher: p,
  ids: new Set(p.openAlexPublisherIds),
}));

export function getPublisherDefinition(id: string | null | undefined): PublisherDefinition | null {
  if (!id) return null;
  return PUBLISHER_BY_ID.get(id) ?? null;
}

/**
 * Filter id for papers whose publisher falls outside the predefined registry
 * above (Nature, SAGE, OUP, PLOS, Frontiers, … — and any future publisher the
 * API returns). Nothing is hard-coded: verification only ever assigns ids from
 * PUBLISHERS, so any paper whose publisher id is missing or unrecognised is
 * "other" by definition and needs no code change when new publishers appear.
 */
export const OTHER_PUBLISHER_ID = "other";
export const OTHER_PUBLISHER_LABEL = "Other Publishers";

/** True when the id belongs to the predefined publisher registry. */
export function isPredefinedPublisherId(id: string | null | undefined): boolean {
  return typeof id === "string" && PUBLISHER_BY_ID.has(id);
}

/**
 * Dynamic "other" gate: the paper belongs under Other Publishers whenever its
 * publisher is NOT one of the predefined brands — including papers with an
 * unverified raw publisher name and papers with no publisher metadata at all.
 */
export function isOtherPublisherPaper(paper: Paper): boolean {
  return !isPredefinedPublisherId(paper.publisher?.id ?? null);
}

export function getPublisherOptions(): { id: string; name: string; website: string }[] {
  return PUBLISHERS.map((p) => ({ id: p.id, name: p.name, website: p.website }));
}

export function getPublisherLabel(id: string | null | undefined, query?: string | null): string {
  if (id === OTHER_PUBLISHER_ID) {
    const trimmed = (query || "").trim();
    return trimmed ? `${OTHER_PUBLISHER_LABEL}: "${trimmed}"` : OTHER_PUBLISHER_LABEL;
  }
  return getPublisherDefinition(id)?.name ?? "All Publishers";
}

/** Normalize free-text publisher input for comparison (lowercase, collapsed whitespace). */
export function normalizePublisherQuery(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ").slice(0, 100);
}

/**
 * Find a predefined brand from free text (e.g. typing "ieee" under Other).
 * Exact match on brand id, brand name, or host-organization alias — plus the
 * case where the user typed extra words around the brand ("ieee paper" still
 * means IEEE). The reverse (short query inside a longer alias, e.g. "nature"
 * inside "springer nature") is deliberately NOT a match so "Nature" never
 * resolves to Springer.
 */
export function findPredefinedByName(query: string | null | undefined): PublisherDefinition | null {
  const q = normalizeName(query);
  if (!q) return null;
  const containsToken = (haystack: string, needle: string): boolean => {
    if (needle.length < 3) return haystack === needle;
    // Match whole words only so "ieee paper" matches IEEE but "nature" does
    // not match "springer nature" via a bare substring.
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
  };
  for (const publisher of PUBLISHERS) {
    const name = normalizeName(publisher.name);
    if (q === publisher.id || q === name) return publisher;
    if (containsToken(q, publisher.id) || containsToken(q, name)) return publisher;
    for (const alias of publisher.hostOrganizationAliases) {
      const normalizedAlias = normalizeName(alias);
      if (q === normalizedAlias) return publisher;
      if (normalizedAlias.length >= 3 && containsToken(q, normalizedAlias)) return publisher;
    }
  }
  return null;
}

function matchByLineage(publisherIds: string[]): PublisherDefinition | null {
  if (publisherIds.length === 0) return null;
  const lookup = new Set(publisherIds);
  for (const { publisher, ids } of PUBLISHER_ID_SETS) {
    for (const id of ids) {
      if (lookup.has(id)) return publisher;
    }
  }
  return null;
}

function matchByHostName(hostOrganizationName: string | null): PublisherDefinition | null {
  if (!hostOrganizationName) return null;
  return ALIAS_TO_PUBLISHER.get(normalizeName(hostOrganizationName)) ?? null;
}

function unknownPublisher(
  rawName: string | null,
  publisherIds: string[],
  reason: string,
  evidence: VerificationEvidence[] = []
): PublisherResult {
  return {
    id: null,
    name: null,
    rawName,
    openAlexPublisherIds: publisherIds,
    isVerified: false,
    evidence,
    reason,
  };
}

/**
 * Resolve the publisher of a paper from OpenAlex source metadata.
 * Returns `isVerified: false` (never a guessed brand) when the metadata has no
 * publisher that maps to a known publisher registry entry.
 */
export function verifyPublisherFromOpenAlex(source: Source | null): PublisherResult {
  if (!source) {
    return unknownPublisher(null, [], "No venue (source) record available for this work.");
  }

  const rawName = source.hostOrganizationName;
  const publisherIds = source.hostOrganizationIds ?? [];

  const evidence: VerificationEvidence[] = [];
  if (rawName) {
    evidence.push({
      field: "primary_location.source.host_organization_name",
      source: "openalex",
      detail: `Publisher entity reported by OpenAlex: ${rawName}`,
    });
  }
  if (publisherIds.length > 0) {
    evidence.push({
      field: "primary_location.source.host_organization_lineage",
      source: "openalex",
      detail: `OpenAlex publisher lineage: ${publisherIds.join(", ")}`,
      url: publisherIds[0] ? `https://openalex.org/${publisherIds[0]}` : undefined,
    });
  }

  const byLineage = matchByLineage(publisherIds);
  if (byLineage) {
    return {
      id: byLineage.id,
      name: byLineage.name,
      rawName,
      openAlexPublisherIds: publisherIds,
      isVerified: true,
      evidence,
      reason: null,
    };
  }

  const byName = matchByHostName(rawName);
  if (byName) {
    return {
      id: byName.id,
      name: byName.name,
      rawName,
      openAlexPublisherIds: publisherIds,
      isVerified: true,
      evidence,
      reason: null,
    };
  }

  if (rawName) {
    return {
      id: null,
      name: rawName,
      rawName,
      openAlexPublisherIds: publisherIds,
      isVerified: false,
      evidence,
      reason: `Publisher metadata "${rawName}" is not in the verified publisher registry, so no brand filter match is offered.`,
    };
  }

  return unknownPublisher(null, publisherIds, "No publisher metadata available for this work.", evidence);
}

const CROSSREF_API = "https://api.crossref.org/works";

/**
 * Crossref fallback for works where OpenAlex carries no publisher metadata.
 * Cached per DOI for the process lifetime to keep searches fast.
 */
const crossrefCache = new Map<string, string | null>();

async function fetchCrossrefPublisher(doi: string): Promise<string | null> {
  const key = doi.toLowerCase();
  if (crossrefCache.has(key)) return crossrefCache.get(key) ?? null;
  try {
    const response = await fetch(`${CROSSREF_API}/${encodeURIComponent(doi)}?mailto=${encodeURIComponent("litfusion-ai@example.com")}`, {
      headers: { Accept: "application/json", "User-Agent": "litfusion-ai/0.1 (mailto:litfusion-ai@example.com)" },
    });
    if (!response.ok) {
      crossrefCache.set(key, null);
      return null;
    }
    const data = (await response.json()) as { message?: { publisher?: string } };
    const publisher = data?.message?.publisher?.trim() || null;
    crossrefCache.set(key, publisher);
    return publisher;
  } catch {
    return null;
  }
}

/**
 * Full publisher verification: OpenAlex metadata first, Crossref as a secondary
 * source of truth. Never fabricates a publisher.
 */
export async function verifyPublisher(paper: Paper): Promise<PublisherResult> {
  const fromOpenAlex = verifyPublisherFromOpenAlex(paper.source);

  if (fromOpenAlex.isVerified) return fromOpenAlex;
  if (paper.doi) {
    const crossrefPublisher = await fetchCrossrefPublisher(paper.doi);
    if (crossrefPublisher) {
      const matched = matchByHostName(crossrefPublisher);
      return {
        id: matched?.id ?? null,
        name: matched?.name ?? crossrefPublisher,
        rawName: crossrefPublisher,
        openAlexPublisherIds: fromOpenAlex.openAlexPublisherIds,
        isVerified: Boolean(matched),
        evidence: [
          ...fromOpenAlex.evidence,
          {
            field: "message.publisher",
            source: "crossref",
            detail: `Publisher registered with Crossref for this DOI: ${crossrefPublisher}`,
            url: paper.doi ? `https://api.crossref.org/works/${encodeURIComponent(paper.doi)}` : undefined,
          },
        ],
        reason: matched ? null : fromOpenAlex.reason,
      };
    }
  }

  return fromOpenAlex;
}

export function clearCrossrefPublisherCache(): void {
  crossrefCache.clear();
}
