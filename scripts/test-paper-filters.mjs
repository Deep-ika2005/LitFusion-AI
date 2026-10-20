/**
 * Test matrix for the verification filters and the verification rules.
 *
 *   1. Scopus Indexed + Published            -> shown
 *   2. Scopus Unknown + Published            -> hidden when the Scopus filter is on
 *   3. Scopus Indexed + Unpublished          -> hidden when the Published filter is on
 *   4. IEEE + Scopus + Published             -> shown for an IEEE search
 *   5. Springer paper                        -> not shown when IEEE is selected
 *   6. Publisher = All                       -> all valid publishers allowed
 *   7. No filters                            -> existing search behaviour preserved
 *
 * Plus rule checks: OpenAlex alone can never confirm Scopus, publication status is
 * derived from metadata, and a publisher is never guessed from a title.
 *
 * Run: npm run test:filters
 */
import { register } from "node:module";

register("./test-resolver.mjs", import.meta.url);

const { matchesPaperFilters } = await import("../src/lib/search.ts");
const { verifyPublicationStatus } = await import("../src/lib/verification/publication.ts");
const { verifyPublisherFromOpenAlex, PUBLISHERS } = await import("../src/lib/verification/publisher.ts");
const { verifyScopusIndexing, getScopusCapability, clearScopusCaches } = await import("../src/lib/verification/scopus.ts");

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const source = (overrides = {}) => ({
  id: "S1",
  displayName: "IEEE Access",
  issn: "2169-3536",
  issnL: "2169-3536",
  issnList: ["2169-3536"],
  type: "journal",
  isOa: true,
  hostOrganizationName: "Institute of Electrical and Electronics Engineers",
  hostOrganizationIds: ["P4310319808"],
  isCore: true,
  ...overrides,
});

const paper = (overrides = {}) => ({
  id: "W1",
  openAlexId: "https://openalex.org/W1",
  title: "Untitled",
  abstract: null,
  authors: [],
  publicationYear: 2025,
  publicationDate: "2025-01-01",
  doi: "https://doi.org/10.1109/ACCESS.2025.0000001",
  citedByCount: 0,
  type: "article",
  source: source(),
  openAccess: { isOa: true, oaStatus: "gold", oaUrl: null, anyRepositoryHasFulltext: false },
  pdfUrl: null,
  landingPageUrl: "https://ieeexplore.ieee.org/document/1",
  topics: [],
  keywords: [],
  primaryTopic: null,
  relevanceScore: null,
  isRetracted: false,
  publisher: null,
  publicationStatus: null,
  scopus: null,
  sourcePlatform: null,
  rawMetadata: {
    primaryLocationVersion: "publishedVersion",
    primaryLocationIsPublished: true,
    primaryLocationIsAccepted: false,
    primaryLocationRawType: "journal-article",
    primaryLocationRawSourceName: "IEEE Access",
    isParatext: false,
    hasPublishedVersion: true,
    hasAcceptedVersion: false,
    hasSubmittedVersion: false,
    biblio: { volume: "13", issue: null, firstPage: "1", lastPage: "10" },
    indexedIn: ["crossref"],
  },
  ...overrides,
});

const verified = (overrides = {}, verification = {}) => {
  const base = paper(overrides);
  return {
    ...base,
    publisher: verifyPublisherFromOpenAlex(base.source),
    publicationStatus: verifyPublicationStatus(base),
    scopus: {
      status: "unknown",
      label: "Unknown",
      method: "none",
      checkedAt: new Date().toISOString(),
      confidence: "unknown",
      evidence: [],
      reason: "test fixture",
      ...verification,
    },
  };
};

const scopusIndexed = {
  status: "indexed",
  label: "Indexed",
  method: "scopus-source-registry",
  checkedAt: new Date().toISOString(),
  confidence: "verified",
  evidence: [{ field: "source.issn", source: "scopus-source-registry", detail: "ISSN listed in the local Scopus source list." }],
  reason: null,
};

const filters = (overrides = {}) => ({ publisher: "all", scopusOnly: false, publishedOnly: false, ...overrides });

console.log("\nLitFusion-AI — publication / Scopus / publisher filter matrix\n");

// --- Fixtures -----------------------------------------------------------------
const ieeeScopusPublished = verified({}, scopusIndexed);
const ieeeScopusUnknownPublished = verified({}, { status: "unknown", label: "Unknown" });
const ieeeScopusPreprint = verified(
  { type: "preprint", doi: null, rawMetadata: { ...paper().rawMetadata, primaryLocationVersion: "submittedVersion", primaryLocationIsPublished: false, hasPublishedVersion: false, hasSubmittedVersion: true } },
  scopusIndexed
);
const springerPublished = verified(
  {
    source: source({
      displayName: "Nature Medicine",
      issn: "1078-8956",
      issnL: "1078-8956",
      issnList: ["1078-8956"],
      hostOrganizationName: "Nature Portfolio",
      hostOrganizationIds: ["P4320310862", "P4310319965"],
    }),
  },
  scopusIndexed
);
const acmPublished = verified(
  {
    source: source({
      displayName: "Proceedings of the ACM",
      issn: null,
      issnL: null,
      issnList: [],
      hostOrganizationName: "Association for Computing Machinery",
      hostOrganizationIds: ["P4310319798"],
    }),
  },
  scopusIndexed
);
const corpus = [ieeeScopusPublished, ieeeScopusUnknownPublished, ieeeScopusPreprint, springerPublished, acmPublished];
const show = (f) => corpus.filter((p) => matchesPaperFilters(p, f)).map((p) => p.publisher?.name);

// --- 1. Scopus Indexed + Published -> shown ------------------------------------
console.log("1. Scopus Indexed + Published -> show");
check("Scopus Indexed Only keeps the indexed+published paper", show(filters({ scopusOnly: true })).includes("IEEE"));
check("Published Papers Only keeps the indexed+published paper", show(filters({ publishedOnly: true })).includes("IEEE"));
check(
  "Scopus + Published keeps the indexed+published paper",
  show(filters({ scopusOnly: true, publishedOnly: true })).includes("IEEE")
);

// --- 2. Scopus Unknown + Published -> hidden with the Scopus filter ------------
console.log("2. Scopus Unknown + Published -> hidden when Scopus filter enabled");
const unknownWithScopusFilter = verified({}, { status: "unknown", label: "Unknown" });
check("Unknown paper is hidden by Scopus Indexed Only", !matchesPaperFilters(unknownWithScopusFilter, filters({ scopusOnly: true })));
check("Unknown paper is still shown when the Scopus filter is off", matchesPaperFilters(unknownWithScopusFilter, filters()));
check("Unknown paper is shown by Published Only (it is published)", matchesPaperFilters(unknownWithScopusFilter, filters({ publishedOnly: true })));

// --- 3. Scopus Indexed + Unpublished -> hidden with the Published filter -------
console.log("3. Scopus Indexed + Unpublished -> hidden when Published filter enabled");
check("Preprint is hidden by Published Papers Only", !matchesPaperFilters(ieeeScopusPreprint, filters({ publishedOnly: true })));
check("Preprint is hidden by the combined filters", !matchesPaperFilters(ieeeScopusPreprint, filters({ scopusOnly: true, publishedOnly: true })));
check("Preprint is still visible with no filters", matchesPaperFilters(ieeeScopusPreprint, filters()));
check("Preprint is reported as a preprint", ieeeScopusPreprint.publicationStatus.status === "preprint");
check("Preprint is not reported as published", ieeeScopusPreprint.publicationStatus.isPublished === false);

// --- 4. IEEE + Scopus + Published -> shown for an IEEE search -----------------
console.log("4. IEEE + Scopus + Published -> show for an IEEE search");
const ieeeResult = show(filters({ publisher: "ieee", scopusOnly: true, publishedOnly: true }));
check("IEEE + Scopus + Published returns the IEEE paper", ieeeResult.includes("IEEE"));
check("IEEE result excludes the Springer paper", !ieeeResult.includes("Springer"));
check("IEEE result excludes the ACM paper", !ieeeResult.includes("ACM"));

// --- 5. Springer paper must not appear when IEEE is selected ------------------
console.log("5. Springer paper -> not shown when IEEE is selected");
check("Springer paper is not returned for publisher=ieee", !matchesPaperFilters(springerPublished, filters({ publisher: "ieee" })));
check("Springer paper is returned for publisher=springer", matchesPaperFilters(springerPublished, filters({ publisher: "springer" })));
check("Springer paper matches via publisher lineage (Nature Portfolio -> Springer Nature)", springerPublished.publisher.id === "springer");

// --- 6. Publisher = All allows every valid publisher --------------------------
console.log("6. Publisher = All -> allow all valid publishers");
const allResults = show(filters({ publisher: "all" }));
check("All returns IEEE", allResults.includes("IEEE"));
check("All returns Springer", allResults.includes("Springer"));
check("All returns ACM", allResults.includes("ACM"));
check("All returns the unknown-scopus paper too", allResults.length === corpus.length);
check(
  "Every filter option has a name and at least one OpenAlex publisher id",
  PUBLISHERS.every((p) => p.name.length > 0 && p.openAlexPublisherIds.length > 0)
);

// --- 7. No filters -> previous behaviour -------------------------------------
console.log("7. No filters -> existing search behaviour preserved");
check("All papers pass with no filters", corpus.every((p) => matchesPaperFilters(p, filters())));
check("Unpublished record is hidden only by the Published filter", (() => {
  const noRecord = verified({
    publicationDate: null,
    publicationYear: 0,
    doi: null,
    source: null,
    rawMetadata: { ...paper().rawMetadata, primaryLocationVersion: null, primaryLocationIsPublished: null, hasPublishedVersion: false, biblio: null },
  });
  return (
    noRecord.publicationStatus.status === "unpublished" &&
    noRecord.publicationStatus.isPublished === false &&
    matchesPaperFilters(noRecord, filters()) &&
    !matchesPaperFilters(noRecord, filters({ publishedOnly: true }))
  );
})());

// --- Accuracy rules -----------------------------------------------------------
console.log("\nAccuracy rules");
const bareIeee = paper();
const noScopusEvidence = await verifyScopusIndexing(bareIeee, { allowNetwork: false, registry: { sources: {} } });
check("No verification source -> Scopus: Unknown", noScopusEvidence.status === "unknown" && noScopusEvidence.label === "Unknown");
check("No verification source -> never 'Indexed'", noScopusEvidence.status !== "indexed");
check("OpenAlex indexedIn never contains scopus", !paper().rawMetadata.indexedIn.includes("scopus"));
const registryIndexed = await verifyScopusIndexing(bareIeee, {
  allowNetwork: false,
  // Registry keys are normalised ISSNs (digits only), as written by build-scopus-registry.mjs.
  registry: { sources: { 21693536: { title: "IEEE Access", publisher: "IEEE" } } },
});
check("ISSN present in the Scopus source list -> Indexed", registryIndexed.status === "indexed");
check("Indexed result carries evidence", registryIndexed.evidence.length > 0);
check("Registry match is labelled Indexed, not just pass-through", registryIndexed.label === "Indexed" && registryIndexed.method === "scopus-source-registry");

// A key is required before the Scopus API is consulted at all.
process.env.SCOPUS_API_KEY = "test-key";
clearScopusCaches();
const apiIndexed = await verifyScopusIndexing(bareIeee, {
  registry: { sources: {} },
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    json: async () => ({ "serial-title": { issn: "2169-3536", title: "IEEE Access" } }),
  }),
});
check("Scopus API 200 -> Indexed", apiIndexed.status === "indexed" && apiIndexed.method === "scopus-api");
clearScopusCaches();
const apiNegative = await verifyScopusIndexing(bareIeee, {
  registry: { sources: {} },
  fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
});
check("Scopus API 404 -> Not indexed", apiNegative.status === "not-indexed");
clearScopusCaches();
const apiDown = await verifyScopusIndexing(bareIeee, {
  registry: { sources: {} },
  fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }),
});
check("Scopus API error -> Unknown (never a guess)", apiDown.status === "unknown");
const noIssnNoDoi = await verifyScopusIndexing(
  { doi: null, source: null, type: "article" },
  { allowNetwork: false, registry: { sources: {} } }
);
check("No ISSN and no DOI -> Unknown", noIssnNoDoi.status === "unknown");
const arxivPreprint = await verifyScopusIndexing(
  {
    doi: null,
    type: "preprint",
    source: source({ displayName: "arXiv", type: "repository", hostOrganizationName: "arXiv", issnL: null, issnList: [], issn: null }),
  },
  { allowNetwork: false, registry: { sources: {} } }
);
check("Preprint server -> Not indexed (reliable metadata)", arxivPreprint.status === "not-indexed");

const ieeeNamedElsewhere = verifyPublisherFromOpenAlex(
  source({ displayName: "IEEE Access", hostOrganizationName: "Some University Press", hostOrganizationIds: [] })
);
check("Publisher is not guessed from the journal name", ieeeNamedElsewhere.isVerified === false && ieeeNamedElsewhere.id === null);
check("Unrecognised publisher still reports the metadata name", ieeeNamedElsewhere.name === "Some University Press");
const noPublisherMetadata = verifyPublisherFromOpenAlex(source({ hostOrganizationName: null, hostOrganizationIds: [] }));
check("Missing publisher metadata -> not verified", noPublisherMetadata.isVerified === false && noPublisherMetadata.name === null);

const accepted = verifyPublicationStatus(
  paper({ rawMetadata: { ...paper().rawMetadata, primaryLocationVersion: "acceptedVersion", primaryLocationIsPublished: false, primaryLocationIsAccepted: true, hasPublishedVersion: false, hasAcceptedVersion: true } })
);
check("Accepted manuscript is not 'published'", accepted.status === "accepted" && accepted.isPublished === false);
const paratext = verifyPublicationStatus(paper({ rawMetadata: { ...paper().rawMetadata, isParatext: true } }));
check("Paratext record is not 'published'", paratext.status === "record-only" && paratext.isPublished === false);
const published = verifyPublicationStatus(paper());
check("publishedVersion -> Published", published.status === "published" && published.isPublished === true && published.confidence === "verified");

const capability = getScopusCapability();
check(
  "Capability describes the active verification source",
  ["scopus-api", "scopus-source-registry", "none"].includes(capability.method)
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
