export interface Author {
  id: string;
  name: string;
  orcid: string | null;
}

export interface Source {
  id: string;
  displayName: string;
  issn: string | null;
  /** Linked ISSN (print) when available. */
  issnL: string | null;
  /** Every ISSN reported by the data source, used for Scopus source lookups. */
  issnList: string[];
  type: string;
  isOa: boolean;
  hostOrganizationName: string | null;
  /** OpenAlex publisher ids from `host_organization_lineage` (self + ancestors). */
  hostOrganizationIds: string[];
  isCore: boolean;
}

export type PublicationStatus =
  | "published"
  | "preprint"
  | "accepted"
  | "submitted"
  | "record-only"
  | "unpublished"
  | "unknown";

export type ScopusStatus = "indexed" | "not-indexed" | "unknown";

export type ScopusVerificationMethod =
  | "scopus-api"
  | "scopus-source-registry"
  | "preprint-repository"
  | "none";

export type VerificationConfidence = "verified" | "unknown";

/** Verified journal quartile tier. Nullability is handled by QuartileResult. */
export type QuartileTier = "Q1" | "Q2" | "Q3" | "Q4";

export type QuartileVerificationMethod =
  | "quartile-registry"
  | "jcr-api"
  | "sjr-mirror"
  | "none";

export interface QuartileResult {
  /** Q1–Q4 when verified, otherwise null (UI must render "Quartile unavailable"). */
  quartile: QuartileTier | null;
  label: string;
  /** SCImago/JCR subject category the quartile was awarded in (when known). */
  category: string | null;
  /** Year of the quartile ranking (when known). */
  year: number | null;
  /** Where the value came from — registry export or a live licensed API. */
  provenance: string | null;
  method: QuartileVerificationMethod;
  checkedAt: string;
  confidence: VerificationConfidence;
  evidence: VerificationEvidence[];
  reason: string | null;
}

/** Per-component 0–100 scores plus the weighted final score for one paper. */
export interface HybridRankingResult {
  final: number;
  relevance: number | null;
  quartile: number | null;
  recency: number | null;
  citations: number | null;
  /** Weights actually applied (may be renormalized when components are missing). */
  weights: RankingWeights;
  /** Component names with no verifiable value — never fabricated. */
  missing: Array<"relevance" | "quartile" | "recency" | "citations">;
  /** Human-readable formula, e.g. "0.40×82 + 0.30×100 + … = 78.4". */
  formula: string;
}

export interface RankingWeights {
  relevance: number;
  quartile: number;
  recency: number;
  citations: number;
}

export interface VerificationEvidence {
  /** Metadata field the decision was based on. Never a title or keyword. */
  field: string;
  source: "openalex" | "crossref" | "scopus-api" | "scopus-source-registry";
  detail: string;
  url?: string;
}

export interface PublicationStatusResult {
  status: PublicationStatus;
  label: string;
  /** Only true when publication is confirmed by metadata (never inferred). */
  isPublished: boolean;
  confidence: VerificationConfidence;
  evidence: VerificationEvidence[];
  reason: string | null;
}

export interface ScopusResult {
  status: ScopusStatus;
  label: string;
  method: ScopusVerificationMethod;
  checkedAt: string;
  confidence: VerificationConfidence;
  evidence: VerificationEvidence[];
  reason: string | null;
}

export interface PublisherResult {
  /** Canonical publisher id used by the publisher filter (null when unrecognised). */
  id: string | null;
  /** Canonical brand name when matched, otherwise the raw metadata name. */
  name: string | null;
  /** Publisher legal entity exactly as reported by the metadata source. */
  rawName: string | null;
  openAlexPublisherIds: string[];
  isVerified: boolean;
  evidence: VerificationEvidence[];
  reason: string | null;
}

export interface SourcePlatform {
  /** e.g. "IEEE Xplore" — derived from the landing page host of the record. */
  name: string;
  host: string | null;
  url: string | null;
}

/** Raw metadata fields kept from OpenAlex so verification stays auditable. */
export interface PaperRawMetadata {
  primaryLocationVersion: string | null;
  primaryLocationIsPublished: boolean | null;
  primaryLocationIsAccepted: boolean | null;
  primaryLocationRawType: string | null;
  primaryLocationRawSourceName: string | null;
  isParatext: boolean;
  hasPublishedVersion: boolean;
  hasAcceptedVersion: boolean;
  hasSubmittedVersion: boolean;
  biblio: {
    volume: string | null;
    issue: string | null;
    firstPage: string | null;
    lastPage: string | null;
  } | null;
  /** OpenAlex indexes the work was found in. Note: never contains "scopus". */
  indexedIn: string[];
}

export interface OpenAccess {
  isOa: boolean;
  oaStatus: "diamond" | "gold" | "green" | "hybrid" | "bronze" | "closed" | null;
  oaUrl: string | null;
  anyRepositoryHasFulltext: boolean;
}

export interface Paper {
  id: string;
  openAlexId: string;
  title: string;
  abstract: string | null;
  authors: Author[];
  publicationYear: number;
  publicationDate: string | null;
  doi: string | null;
  citedByCount: number;
  type: string;
  source: Source | null;
  openAccess: OpenAccess;
  pdfUrl: string | null;
  landingPageUrl: string | null;
  topics: string[];
  keywords: string[];
  primaryTopic: string | null;
  relevanceScore: number | null;
  isRetracted: boolean;
  /** Verification outputs. Null only for records stored before these existed. */
  publisher: PublisherResult | null;
  publicationStatus: PublicationStatusResult | null;
  scopus: ScopusResult | null;
  /** Verified journal quartile. Null only for records stored before it existed. */
  quartile: QuartileResult | null;
  /** Hybrid ranking breakdown. Attached by the search pipeline for hybrid sorts. */
  ranking: HybridRankingResult | null;
  sourcePlatform: SourcePlatform | null;
  rawMetadata: PaperRawMetadata | null;
}

/** The subset of facets that is derived from verified metadata rather than raw OpenAlex data. */
export interface VerificationFacets {
  publisherCounts: Record<string, number>;
  scopusCounts: { indexed: number; "not-indexed": number; unknown: number };
  publicationStatusCounts: Record<string, number>;
  quartileCounts: { Q1: number; Q2: number; Q3: number; Q4: number; unranked: number };
}

export interface SearchFacets {
  typeCounts: Record<string, number>;
  accessCounts: { open: number; restricted: number };
  yearCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  authorCounts: Record<string, number>;
  publisherCounts?: Record<string, number>;
  scopusCounts?: { indexed: number; "not-indexed": number; unknown: number };
  publicationStatusCounts?: Record<string, number>;
  quartileCounts?: { Q1: number; Q2: number; Q3: number; Q4: number; unranked: number };
}

export interface AppliedFilters {
  publisher: string;
  publisherQuery: string;
  scopusOnly: boolean;
  publishedOnly: boolean;
  /** Selected quartile tiers ("Q1".."Q4") plus "unranked" for Quartile unavailable. Empty = no filter. */
  quartiles: string[];
}

export interface ScopusVerificationCapability {
  /** "scopus-api" when an Elsevier key is configured, "registry" when the local source list has entries. */
  method: "scopus-api" | "scopus-source-registry" | "none";
  isAvailable: boolean;
  registryEntryCount: number;
  detail: string;
}

export interface SearchResponse {
  query: string;
  totalResults: number;
  page: number;
  perPage: number;
  totalPages: number;
  results: Paper[];
  facets: SearchFacets;
  nextCursor: string | null;
  appliedFilters?: AppliedFilters;
  /** Candidates inspected from the data source before verification filters were applied. */
  scannedCandidates?: number;
  /** True when the scan budget was reached, so more matches may exist upstream. */
  hasMoreResults?: boolean;
  scopusVerification?: ScopusVerificationCapability;
}

export interface SearchParams {
  query: string;
  page: number;
  perPage: number;
  sort: string;
  yearFrom: number | null;
  yearTo: number | null;
  types: string[];
  accessType: string;
  sources: string[];
  authors: string[];
  minCitations: number | null;
  topics: string[];
  /** Canonical publisher id from the publisher filter, or "all". */
  publisher: string;
  /** Free-text publisher name typed under "Other Publishers" ("" when unused). */
  publisherQuery: string;
  scopusOnly: boolean;
  publishedOnly: boolean;
  /** Quartile filter selection: subset of ["Q1","Q2","Q3","Q4","unranked"]. */
  quartiles: string[];
}

export interface SavedPaper {
  id: string;
  userId: string;
  paperId: string;
  paperData: Paper;
  createdAt: string;
}

export interface ComparisonData {
  papers: Paper[];
}
