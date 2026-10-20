import type { HybridRankingResult, Paper, RankingWeights } from "@/types";
import { quartileScoreForTier } from "./verification/quartile";

/**
 * High-priority (best-first) ranking.
 *
 * Combines every verified quality signal into a single score so the best
 * paper across all dimensions sorts first:
 *   Scopus indexed > published > verified publisher > citations > recency.
 * Retracted papers always sort last.
 */
export const PRIORITY_SCORES = {
  SCOPUS_INDEXED: 100,
  PUBLISHED: 50,
  ACCEPTED: 20,
  PUBLISHER_VERIFIED: 30,
  PUBLISHER_OTHER: 10,
} as const;

export function priorityScore(paper: Paper): number {
  let score = 0;

  if (paper.scopus?.status === "indexed") score += PRIORITY_SCORES.SCOPUS_INDEXED;

  const pubStatus = paper.publicationStatus?.status;
  if (paper.publicationStatus?.isPublished === true || pubStatus === "published") {
    score += PRIORITY_SCORES.PUBLISHED;
  } else if (pubStatus === "accepted") {
    score += PRIORITY_SCORES.ACCEPTED;
  }

  if (paper.publisher?.isVerified === true) {
    score += PRIORITY_SCORES.PUBLISHER_VERIFIED;
  } else if (paper.publisher?.id) {
    score += PRIORITY_SCORES.PUBLISHER_OTHER;
  }

  const citations = Math.max(0, paper.citedByCount || 0);
  score += Math.log10(citations + 1) * 10;

  return score;
}

function comparePriority(a: Paper, b: Paper): number {
  // Retracted records always sink to the bottom.
  if (a.isRetracted !== b.isRetracted) return a.isRetracted ? 1 : -1;

  const scoreDiff = priorityScore(b) - priorityScore(a);
  if (scoreDiff !== 0) return scoreDiff;

  // Deterministic tie-breakers: impact, recency, upstream relevance.
  if (b.citedByCount !== a.citedByCount) return b.citedByCount - a.citedByCount;
  if (b.publicationYear !== a.publicationYear) return b.publicationYear - a.publicationYear;
  return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
}

/** Sort a copy of `papers` best-first. Never mutates the input array. */
export function rankPapersByPriority<T extends Paper>(papers: T[]): T[] {
  return [...papers].sort(comparePriority);
}

/* ------------------------------------------------------------------ */
/* Quartile-based hybrid ranking                                       */
/* ------------------------------------------------------------------ */

/**
 * Default hybrid weights (research relevance 40%, quartile 30%, recency 20%,
 * citation impact 10%). Overridable per-component via
 * RANKING_WEIGHT_{RELEVANCE,QUARTILE,RECENCY,CITATIONS} env vars; values are
 * renormalized to sum to 1 so a partial env configuration stays fair.
 */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  relevance: 0.4,
  quartile: 0.3,
  recency: 0.2,
  citations: 0.1,
};

function readWeightEnv(name: string): number | null {
  const raw = (process.env[name] || "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function getRankingWeights(): RankingWeights {
  const merged: RankingWeights = {
    relevance: readWeightEnv("RANKING_WEIGHT_RELEVANCE") ?? DEFAULT_RANKING_WEIGHTS.relevance,
    quartile: readWeightEnv("RANKING_WEIGHT_QUARTILE") ?? DEFAULT_RANKING_WEIGHTS.quartile,
    recency: readWeightEnv("RANKING_WEIGHT_RECENCY") ?? DEFAULT_RANKING_WEIGHTS.recency,
    citations: readWeightEnv("RANKING_WEIGHT_CITATIONS") ?? DEFAULT_RANKING_WEIGHTS.citations,
  };
  const total = merged.relevance + merged.quartile + merged.recency + merged.citations;
  if (total <= 0) return { ...DEFAULT_RANKING_WEIGHTS };
  return {
    relevance: merged.relevance / total,
    quartile: merged.quartile / total,
    recency: merged.recency / total,
    citations: merged.citations / total,
  };
}

export interface HybridScoreContext {
  minRelevance: number;
  maxRelevance: number;
  minYear: number;
  maxYear: number;
  currentYear: number;
  /** log10(maxCitations + 1) across the set; 0 when every paper has 0 citations. */
  logDenominator: number;
  weights: RankingWeights;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Build the per-set normalization context. Pure and testable. */
export function buildHybridContext(papers: Paper[], weights?: RankingWeights): HybridScoreContext {
  const w = weights ?? getRankingWeights();
  const relevanceValues = papers
    .map((p) => finiteOrNull(p.relevanceScore))
    .filter((v): v is number => v !== null);
  const years = papers
    .map((p) => (typeof p.publicationYear === "number" && p.publicationYear > 0 ? p.publicationYear : null))
    .filter((v): v is number => v !== null);
  const maxCitations = papers.reduce((max, p) => Math.max(max, Math.max(0, p.citedByCount || 0)), 0);
  const currentYear = new Date().getFullYear();
  return {
    minRelevance: relevanceValues.length > 0 ? Math.min(...relevanceValues) : 0,
    maxRelevance: relevanceValues.length > 0 ? Math.max(...relevanceValues) : 0,
    minYear: years.length > 0 ? Math.min(...years) : currentYear,
    maxYear: years.length > 0 ? Math.max(...years, currentYear) : currentYear,
    currentYear,
    logDenominator: maxCitations > 0 ? Math.log10(maxCitations + 1) : 0,
    weights: w,
  };
}

/**
 * Score one paper on the 0–100 hybrid scale.
 *
 * - relevance: min-max normalized OpenAlex relevance_score across the set.
 * - quartile: Q1=100/Q2=75/Q3=50/Q4=25, null when unverified (missing).
 * - recency: 100 * (year - minYear) / max(1, currentYear - minYear).
 * - citations: 100 * log10(c+1) / log10(maxC+1) — log dampening stops old,
 *   highly cited papers from automatically dominating.
 *
 * Missing components are reported in `missing` and their weight is
 * redistributed over the present components (renormalized), so papers without
 * quartile metadata are never excluded nor fabricated a score.
 */
export function hybridScoreForPaper(paper: Paper, ctx: HybridScoreContext): HybridRankingResult {
  const missing: HybridRankingResult["missing"] = [];

  let relevance: number | null = null;
  const rawRelevance = finiteOrNull(paper.relevanceScore);
  if (rawRelevance !== null && ctx.maxRelevance > ctx.minRelevance) {
    relevance = ((rawRelevance - ctx.minRelevance) / (ctx.maxRelevance - ctx.minRelevance)) * 100;
  } else if (rawRelevance !== null) {
    relevance = 100;
  } else {
    missing.push("relevance");
  }

  const quartile = quartileScoreForTier(paper.quartile?.quartile ?? null);
  if (quartile === null) missing.push("quartile");

  let recency: number | null = null;
  if (typeof paper.publicationYear === "number" && paper.publicationYear > 0) {
    const span = Math.max(1, ctx.currentYear - ctx.minYear);
    recency = Math.min(100, Math.max(0, ((paper.publicationYear - ctx.minYear) / span) * 100));
  } else {
    missing.push("recency");
  }

  let citations: number | null = null;
  const cites = Math.max(0, paper.citedByCount || 0);
  if (ctx.logDenominator > 0) {
    citations = (Math.log10(cites + 1) / ctx.logDenominator) * 100;
  } else {
    citations = 0;
  }

  const present: Array<{ key: keyof RankingWeights; value: number | null }> = [
    { key: "relevance", value: relevance },
    { key: "quartile", value: quartile },
    { key: "recency", value: recency },
    { key: "citations", value: citations },
  ];
  const presentWeight = present.reduce(
    (sum, p) => sum + (p.value !== null ? ctx.weights[p.key] : 0),
    0
  );
  const final =
    presentWeight > 0
      ? present.reduce(
          (sum, p) => sum + (p.value !== null ? (p.value * ctx.weights[p.key]) / presentWeight : 0),
          0
        )
      : 0;

  const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  const parts = present
    .filter((p) => p.value !== null)
    .map((p) => `${ctx.weights[p.key].toFixed(2)}×${round1(p.value)}`)
    .join(" + ");
  return {
    final: Math.round(final * 10) / 10,
    relevance: round1(relevance),
    quartile: round1(quartile),
    recency: round1(recency),
    citations: round1(citations),
    weights: { ...ctx.weights },
    missing,
    formula: presentWeight > 0 ? `${parts} (renormalized) = ${Math.round(final * 10) / 10}` : "no scoreable components = 0",
  };
}

/** Attach hybrid scores to a copy of `papers`. Never mutates the input. */
export function attachHybridScores<T extends Paper>(papers: T[], weights?: RankingWeights): T[] {
  const ctx = buildHybridContext(papers, weights);
  return papers.map((paper) => ({ ...paper, ranking: hybridScoreForPaper(paper, ctx) }));
}

function compareHybrid(a: Paper, b: Paper): number {
  if (a.isRetracted !== b.isRetracted) return a.isRetracted ? 1 : -1;
  const diff = (b.ranking?.final ?? 0) - (a.ranking?.final ?? 0);
  if (diff !== 0) return diff;
  if (b.citedByCount !== a.citedByCount) return b.citedByCount - a.citedByCount;
  if (b.publicationYear !== a.publicationYear) return b.publicationYear - a.publicationYear;
  return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
}

/** Sort a copy of `papers` by hybrid final score (attaches scores first). */
export function rankPapersByHybrid<T extends Paper>(papers: T[], weights?: RankingWeights): T[] {
  return attachHybridScores(papers, weights).sort(compareHybrid);
}

function quartileRank(tier: string | null | undefined): number {
  switch (tier) {
    case "Q1": return 4;
    case "Q2": return 3;
    case "Q3": return 2;
    case "Q4": return 1;
    default: return 0;
  }
}

/** Sort a copy of `papers` highest-quartile-first (unranked last, then recency). */
export function rankPapersByQuartile<T extends Paper>(papers: T[]): T[] {
  return [...papers].sort((a, b) => {
    if (a.isRetracted !== b.isRetracted) return a.isRetracted ? 1 : -1;
    const diff = quartileRank(b.quartile?.quartile) - quartileRank(a.quartile?.quartile);
    if (diff !== 0) return diff;
    if (b.publicationYear !== a.publicationYear) return b.publicationYear - a.publicationYear;
    return b.citedByCount - a.citedByCount;
  });
}
