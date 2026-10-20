/**
 * Test matrix for the quartile-based hybrid ranking system.
 *
 * Sample comparison (the core fairness case):
 *   A. Older highly cited paper (1998, 2000 citations, Q4 venue)
 *   B. Newer paper in a higher-quartile journal (2024, 15 citations, Q1 venue)
 *   -> B must outrank A on Best Match when relevance is comparable, proving
 *      citations no longer dominate.
 *
 * Edge cases:
 *   1. Missing quartile      -> "Quartile unavailable", stays visible, component skipped
 *   2. Missing publication year (0) -> recency skipped, never fabricated
 *   3. Zero citations        -> citation score 0 (legitimate zero, not missing)
 *   4. Missing relevance     -> relevance skipped, weights renormalized
 *   5. Retracted Q1 paper    -> always sorts last
 *   6. Quartile filter       -> Q1-only keeps B, unranked filter keeps unranked papers
 *   7. No fabricated quartile: unknown ISSN -> null, never Q1-Q4
 *
 * Run: npm run test:ranking
 */
import { register } from "node:module";

register("./test-resolver.mjs", import.meta.url);

const { verifyQuartile, clearQuartileCaches } = await import("../src/lib/verification/quartile.ts");
const {
  attachHybridScores,
  buildHybridContext,
  hybridScoreForPaper,
  rankPapersByHybrid,
  rankPapersByQuartile,
  DEFAULT_RANKING_WEIGHTS,
} = await import("../src/lib/ranking.ts");
const { matchesPaperFilters, normalizeQuartileFilter } = await import("../src/lib/search.ts");

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
  displayName: "Test Journal",
  issn: "1111-1111",
  issnL: "1111-1111",
  issnList: ["1111-1111"],
  type: "journal",
  isOa: true,
  hostOrganizationName: "Test Publisher",
  hostOrganizationIds: [],
  isCore: true,
  ...overrides,
});

const quartileResult = (quartile, extras = {}) => ({
  quartile,
  label: quartile ?? "Quartile unavailable",
  category: quartile ? "Test Category" : null,
  year: quartile ? 2024 : null,
  provenance: quartile ? "test registry" : null,
  method: quartile ? "quartile-registry" : "none",
  checkedAt: new Date().toISOString(),
  confidence: quartile ? "verified" : "unknown",
  evidence: [],
  reason: quartile ? null : "test fixture: no verified quartile",
  ...extras,
});

const paper = (overrides = {}) => ({
  id: "W1",
  openAlexId: "https://openalex.org/W1",
  title: "Untitled",
  abstract: null,
  authors: [],
  publicationYear: 2020,
  publicationDate: "2020-01-01",
  doi: null,
  citedByCount: 0,
  type: "article",
  source: source(),
  openAccess: { isOa: true, oaStatus: "gold", oaUrl: null, anyRepositoryHasFulltext: false },
  pdfUrl: null,
  landingPageUrl: null,
  topics: [],
  keywords: [],
  primaryTopic: null,
  relevanceScore: 50,
  isRetracted: false,
  publisher: null,
  publicationStatus: null,
  scopus: null,
  quartile: quartileResult(null),
  ranking: null,
  sourcePlatform: null,
  rawMetadata: null,
  ...overrides,
});

console.log("\nLitFusion-AI — quartile hybrid ranking matrix\n");

// --- Core fairness case -------------------------------------------------------
console.log("Core: older highly cited Q4 vs newer Q1");
const oldHighlyCited = paper({
  id: "W-old",
  title: "Old highly cited",
  publicationYear: 1998,
  publicationDate: "1998-06-01",
  citedByCount: 2000,
  relevanceScore: 80,
  quartile: quartileResult("Q4"),
});
const newHighQuartile = paper({
  id: "W-new",
  title: "New Q1 paper",
  publicationYear: 2024,
  publicationDate: "2024-03-01",
  citedByCount: 15,
  relevanceScore: 82,
  quartile: quartileResult("Q1"),
});
const ranked = rankPapersByHybrid([oldHighlyCited, newHighQuartile]);
check(
  "Newer Q1 paper outranks older highly cited Q4 paper",
  ranked[0].id === "W-new",
  `order was ${ranked.map((p) => p.id).join(",")}`
);
const ctx = buildHybridContext([oldHighlyCited, newHighQuartile]);
const oldScore = hybridScoreForPaper(oldHighlyCited, ctx);
const newScore = hybridScoreForPaper(newHighQuartile, ctx);
check("Both papers carry a transparent formula", Boolean(oldScore.formula) && Boolean(newScore.formula));
check("Citation component uses log dampening (max=100, 15 cites still scores fairly)", oldScore.citations === 100 && newScore.citations !== null && newScore.citations > 10 && newScore.citations < 100);
console.log(`       old=${oldScore.formula} | new=${newScore.formula}`);

// --- Edge cases ----------------------------------------------------------------
console.log("Edge cases");
const missingQuartile = paper({ quartile: quartileResult(null) });
const s1 = hybridScoreForPaper(missingQuartile, buildHybridContext([missingQuartile]));
check("Missing quartile -> component null + listed in missing", s1.quartile === null && s1.missing.includes("quartile"));
check("Missing quartile paper still scores (not excluded)", s1.final > 0);

const missingYear = paper({ publicationYear: 0, publicationDate: null });
const s2 = hybridScoreForPaper(missingYear, buildHybridContext([missingYear]));
check("Missing year -> recency null + missing (never fabricated)", s2.recency === null && s2.missing.includes("recency"));

const zeroCites = paper({ citedByCount: 0 });
const s3 = hybridScoreForPaper(zeroCites, buildHybridContext([zeroCites, paper({ citedByCount: 10 })]));
check("Zero citations -> legitimate 0, NOT missing", s3.citations === 0 && !s3.missing.includes("citations"));

const missingRelevance = paper({ relevanceScore: null });
const s4 = hybridScoreForPaper(missingRelevance, buildHybridContext([missingRelevance]));
check("Missing relevance -> skipped + renormalized", s4.relevance === null && s4.missing.includes("relevance") && s4.final >= 0);

const retractedQ1 = paper({ isRetracted: true, quartile: quartileResult("Q1"), relevanceScore: 99, citedByCount: 5000, publicationYear: 2024 });
const rankedRetracted = rankPapersByHybrid([retractedQ1, newHighQuartile]);
check("Retracted Q1 paper sorts last", rankedRetracted[rankedRetracted.length - 1].id === retractedQ1.id);

const noMeta = paper({ source: null, doi: null, publicationYear: 0, relevanceScore: null, citedByCount: 0, quartile: quartileResult(null) });
const s5 = hybridScoreForPaper(noMeta, buildHybridContext([noMeta]));
check("Unavailable metadata -> transparent missing list, final is a number", Array.isArray(s5.missing) && Number.isFinite(s5.final));

// --- Quartile verification honesty ----------------------------------------------
console.log("Verification honesty");
clearQuartileCaches();
const unknownIssn = await verifyQuartile(
  { source: source({ issn: "9999-9999", issnL: "9999-9999", issnList: ["9999-9999"] }) },
  { allowNetwork: false, registry: { quartiles: {} } }
);
check("Unknown ISSN -> Quartile unavailable (never guessed)", unknownIssn.quartile === null && unknownIssn.label === "Quartile unavailable");
const registryHit = await verifyQuartile(
  { source: source({ issn: "2169-3536", issnL: "2169-3536", issnList: ["2169-3536"] }) },
  { allowNetwork: false, registry: { quartiles: { 21693536: { quartile: "Q1", category: "Engineering", year: 2024 } } } }
);
check("Registry ISSN hit -> verified Q1 with category+year", registryHit.quartile === "Q1" && registryHit.category === "Engineering" && registryHit.year === 2024);
const noIssn = await verifyQuartile({ source: null }, { allowNetwork: false, registry: { quartiles: {} } });
check("No ISSN -> unavailable with honest reason", noIssn.quartile === null && typeof noIssn.reason === "string");

// --- Quartile filter -------------------------------------------------------------
console.log("Quartile filter");
const q1Only = { publisher: "all", publisherQuery: "", scopusOnly: false, publishedOnly: false, quartiles: ["Q1"] };
check("Q1 filter keeps the Q1 paper", matchesPaperFilters(newHighQuartile, q1Only));
check("Q1 filter drops the Q4 paper", !matchesPaperFilters(oldHighlyCited, q1Only));
const unrankedOnly = { publisher: "all", publisherQuery: "", scopusOnly: false, publishedOnly: false, quartiles: ["unranked"] };
check("Unranked filter keeps quartile-less papers (not excluded)", matchesPaperFilters(missingQuartile, unrankedOnly));
check("Quartile filter normalizes junk input", normalizeQuartileFilter("Q1,bogus,Q5").join(",") === "Q1");

// --- Sort helpers -----------------------------------------------------------------
console.log("Sort helpers");
const byQuartile = rankPapersByQuartile([oldHighlyCited, newHighQuartile, missingQuartile]);
check("Highest-quartile sort: Q1 first, unranked last", byQuartile[0].id === "W-new" && byQuartile[byQuartile.length - 1].quartile.quartile === null);
const scored = attachHybridScores([oldHighlyCited, newHighQuartile]);
check("attachHybridScores never mutates input", oldHighlyCited.ranking === null && scored.every((p) => p.ranking !== null));
check(
  "Default weights are 40/30/20/10",
  DEFAULT_RANKING_WEIGHTS.relevance === 0.4 &&
    DEFAULT_RANKING_WEIGHTS.quartile === 0.3 &&
    DEFAULT_RANKING_WEIGHTS.recency === 0.2 &&
    DEFAULT_RANKING_WEIGHTS.citations === 0.1
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
