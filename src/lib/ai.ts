import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface PaperAnalysis {
  summary: string;
  methodology: string;
  keyFindings: string;
  limitations: string;
  futureWork: string;
}

export interface ComparePaperInput {
  id: string;
  title: string;
  abstract: string | null;
  publicationYear: number;
  citedByCount: number;
  sourceName: string | null;
  doi: string | null;
}

export interface ComparedPaper {
  id: string;
  title: string;
  summary: string;
  existingSystem: string;
  algorithm: string;
  methodology: string;
  keyFindings: string;
  limitations: string;
  bestUseCase: string;
}

export interface PapersComparison {
  papers: ComparedPaper[];
  /** Markdown table comparing methodology | dataset | results | limitations | citations | year. */
  comparisonTable: string;
  winnerId: string;
  winnerTitle: string;
  /** Concrete reasons the winner is best (novelty, methodology strength, results, validation, use). */
  winnerReasons: string[];
  /** Concrete reasons each non-winner is not best, keyed by paper id. */
  loserReasons: Record<string, string[]>;
  verdict: string;
  /** "ai" for a full model verdict, "basic" for the no-AI metadata fallback. */
  mode?: "ai" | "basic";
  /** Shown in the UI when mode is "basic". */
  notice?: string;
}

export async function summarizePaper(
  abstract: string,
  title: string
): Promise<PaperAnalysis> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are a research paper analyst. Extract key information from academic papers. Be concise, precise, and use bullet points where appropriate. Always respond in the exact JSON format requested.",
      },
      {
        role: "user",
        content: `Analyze this research paper and return a JSON object with exactly these fields:
- summary: 2-3 sentence summary of the paper
- methodology: The main methodology/technique used
- keyFindings: Key findings and results
- limitations: Limitations of the study
- futureWork: Suggested future research directions

Paper Title: ${title}

Abstract: ${abstract}

Return ONLY valid JSON, no markdown fences.`,
      },
    ],
    temperature: 0.3,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content || "{}";

  try {
    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || "No summary available.",
      methodology: parsed.methodology || "No methodology information available.",
      keyFindings: parsed.keyFindings || "No key findings available.",
      limitations: parsed.limitations || "No limitations information available.",
      futureWork: parsed.futureWork || "No future work information available.",
    };
  } catch {
    return {
      summary: content.substring(0, 500),
      methodology: "Could not parse methodology.",
      keyFindings: "Could not parse key findings.",
      limitations: "Could not parse limitations.",
      futureWork: "Could not parse future work.",
    };
  }
}

function truncate(text: string, maxChars: number): string {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}…` : cleaned;
}

function splitSentences(text: string): string[] {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned.match(/[^.!?]+[.!?]+/g);
  return (parts && parts.length > 0 ? parts : [cleaned]).map((s) => s.trim()).filter(Boolean);
}

function pickSentences(
  sentences: string[],
  hints: string[],
  max: number,
  used: Set<string>
): string[] {
  const out: string[] = [];
  for (const s of sentences) {
    if (out.length >= max) break;
    if (used.has(s)) continue;
    const low = s.toLowerCase();
    if (hints.some((h) => low.includes(h))) {
      out.push(s);
      used.add(s);
    }
  }
  return out;
}

function shortTitle(title: string, maxChars = 60): string {
  const cleaned = (title || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled";
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function sanitizeCell(text: string): string {
  return (text || "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

const PROBLEM_HINTS = ["problem", "challenge", "existing", "prior", "traditional", "difficult", "issue", "gap"];
const METHOD_HINTS = ["method", "algorithm", "approach", "model", "technique", "framework", "propos", "experiment", "dataset", "evaluat", "train", "network", "architecture"];
const RESULT_HINTS = ["result", "finding", "accuracy", "outperform", "improv", "achiev", "demonstrat", "show that", "precision", "recall"];
const LIMIT_HINTS = ["limitation", "future work", "drawback", "weakness", "threat to validity"];

/**
 * No-AI fallback: ranks papers purely on verified metadata (citations, then
 * recency) and extracts per-paper sections from abstract sentences. Every
 * statement is traceable to the input — nothing is invented — and the result
 * is labelled mode "basic" so the UI can say the full AI verdict needs credits.
 */
export function buildBasicComparison(papers: ComparePaperInput[]): PapersComparison {
  const ranked = [...papers].sort(
    (a, b) => b.citedByCount - a.citedByCount || (b.publicationYear || 0) - (a.publicationYear || 0)
  );
  const winner = ranked[0];

  const compared: ComparedPaper[] = papers.map((p) => {
    const sentences = splitSentences(p.abstract ?? "");
    const used = new Set<string>();
    const summarySentences = sentences.slice(0, 2);
    summarySentences.forEach((s) => used.add(s));
    const existing = pickSentences(sentences, PROBLEM_HINTS, 2, used);
    const methodology = pickSentences(sentences, METHOD_HINTS, 2, used);
    const findings = pickSentences(sentences, RESULT_HINTS, 2, used);
    const limitations = pickSentences(sentences, LIMIT_HINTS, 2, used);
    const closing = sentences.length > 0 ? sentences[sentences.length - 1] : "";
    return {
      id: p.id,
      title: p.title,
      summary:
        summarySentences.length > 0
          ? truncate(summarySentences.join(" "), 500)
          : "No abstract available.",
      existingSystem:
        existing.length > 0 ? truncate(existing.join(" "), 500) : "Not clearly stated in abstract.",
      algorithm: "Not extracted in basic mode — add OpenAI credits for algorithm identification.",
      methodology:
        methodology.length > 0
          ? truncate(methodology.join(" "), 500)
          : "Not clearly stated in abstract.",
      keyFindings:
        findings.length > 0
          ? truncate(findings.join(" "), 500)
          : closing
            ? truncate(closing, 500)
            : "Not clearly stated in abstract.",
      limitations:
        limitations.length > 0 ? truncate(limitations.join(" "), 500) : "Not stated in abstract.",
      bestUseCase:
        p.id === winner.id
          ? "Top pick by basic ranking (citations, then recency) — verify fit against its abstract."
          : "Consider if its methods fit your use case better — compare abstracts against the winner.",
    };
  });

  const byId = new Map(compared.map((c) => [c.id, c]));
  const winnerReasons: string[] = [
    "Selected by basic metadata ranking (citations, then recency) — the full AI verdict needs OpenAI credits.",
  ];
  for (const other of ranked.slice(1)) {
    if (winner.citedByCount > other.citedByCount) {
      winnerReasons.push(
        `More citations than "${shortTitle(other.title)}" (${winner.citedByCount.toLocaleString()} vs ${other.citedByCount.toLocaleString()}).`
      );
    }
    if ((winner.publicationYear || 0) > (other.publicationYear || 0)) {
      winnerReasons.push(
        `More recent than "${shortTitle(other.title)}" (${winner.publicationYear || "unknown year"} vs ${other.publicationYear || "unknown year"}).`
      );
    }
  }

  const loserReasons: Record<string, string[]> = {};
  for (const other of ranked.slice(1)) {
    const reasons: string[] = [];
    if (other.citedByCount < winner.citedByCount) {
      reasons.push(
        `Fewer citations than the winner (${other.citedByCount.toLocaleString()} vs ${winner.citedByCount.toLocaleString()}).`
      );
    }
    if ((other.publicationYear || 0) < (winner.publicationYear || 0)) {
      reasons.push(
        `Older than the winner (${other.publicationYear || "unknown year"} vs ${winner.publicationYear || "unknown year"}).`
      );
    }
    reasons.push("Ranked below the winner on citations/recency by the basic metadata ranking.");
    loserReasons[other.id] = reasons.slice(0, 5);
  }

  const tableRows = papers.map((p) => {
    const card = byId.get(p.id);
    return `| ${sanitizeCell(shortTitle(p.title, 40))} | ${sanitizeCell(truncate(card?.methodology ?? "", 80))} | Not extracted (basic mode) | ${sanitizeCell(truncate(card?.keyFindings ?? "", 80))} | ${sanitizeCell(truncate(card?.limitations ?? "", 60))} | ${p.citedByCount.toLocaleString()} | ${p.publicationYear || "Unknown"} |`;
  });
  const comparisonTable = `| Paper | Methodology | Dataset | Results | Limitations | Citations | Year |\n| --- | --- | --- | --- | --- | --- | --- |\n${tableRows.join("\n")}`;

  const venue = winner.sourceName ? `, ${winner.sourceName}` : "";
  return {
    papers: compared,
    comparisonTable,
    winnerId: winner.id,
    winnerTitle: winner.title,
    winnerReasons: winnerReasons.slice(0, 8),
    loserReasons,
    verdict: `Basic comparison (AI unavailable): "${shortTitle(winner.title, 80)}" ranks highest — ${winner.citedByCount.toLocaleString()} citations, ${winner.publicationYear || "unknown year"}${venue}. Add OpenAI credits for a full AI verdict covering methodology, algorithms and limitations.`,
    mode: "basic",
    notice:
      "AI quota exhausted — showing a basic metadata comparison instead. Add credits at platform.openai.com/settings/organization/billing for the full AI verdict.",
  };
}

function fallbackComparison(papers: ComparePaperInput[], detail: string): PapersComparison {
  return {
    papers: papers.map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.abstract ? truncate(p.abstract, 300) : "No abstract available.",
      existingSystem: "Not available (AI comparison failed).",
      algorithm: "Not available (AI comparison failed).",
      methodology: "Not available (AI comparison failed).",
      keyFindings: "Not available (AI comparison failed).",
      limitations: "Not available (AI comparison failed).",
      bestUseCase: "Not available (AI comparison failed).",
    })),
    comparisonTable: "",
    winnerId: papers[0]?.id ?? "",
    winnerTitle: papers[0]?.title ?? "",
    winnerReasons: [],
    loserReasons: {},
    verdict: detail || "AI comparison is currently unavailable. The raw abstracts below can still be compared manually.",
    mode: "basic",
    notice: "The AI returned an unusable response — showing abstract extracts instead.",
  };
}

/**
 * Compare 2-5 papers and pick a winner: best paper + why, why each other paper
 * is not best, existing system, algorithm/methodology per paper.
 * Only uses the supplied title/abstract/metadata — never invents details.
 */
export async function comparePapers(papers: ComparePaperInput[]): Promise<PapersComparison> {
  if (papers.length < 2) throw new Error("At least 2 papers are required for comparison.");
  if (papers.length > 5) throw new Error("At most 5 papers can be compared at once.");

  const paperBlocks = papers
    .map(
      (p, i) => `PAPER ${i + 1} (id: ${p.id}):
Title: ${truncate(p.title, 300)}
Abstract: ${p.abstract ? truncate(p.abstract, 1500) : "Not available"}
Year: ${p.publicationYear || "Unknown"}, Citations: ${p.citedByCount ?? 0}, Venue: ${p.sourceName || "Unknown"}, DOI: ${p.doi || "Unknown"}`
    )
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are a research analyst. Compare academic papers strictly from the supplied titles, abstracts and metadata. Never invent algorithms, datasets, metrics or results. When the abstract does not state something, write 'Not stated in abstract'. Always pick exactly one winner. Always respond in the exact JSON format requested.",
      },
      {
        role: "user",
        content: `Compare these ${papers.length} research papers and return a JSON object with exactly these fields:
- papers: array (one per paper, same order, with id and title copied exactly) of { id, title, summary (2-3 lines), existingSystem (problem / prior approach addressed), algorithm (named algorithm/technique or "Not stated in abstract"), methodology (approach, dataset, metrics or "Not stated in abstract"), keyFindings, limitations, bestUseCase (when to choose this paper) }
- comparisonTable: markdown table with columns Paper | Methodology | Dataset | Results | Limitations | Citations | Year
- winnerId: id of the single best paper (must be one of the input ids)
- winnerTitle: title of the winner (copied exactly)
- winnerReasons: 4-6 concrete reasons the winner is best (novelty, methodology strength, results, validation, citations, practical use)
- loserReasons: object mapping each NON-winner paper id to 3-5 concrete reasons it is not best
- verdict: 3-5 sentence overall verdict naming the winner and its strongest advantage

${paperBlocks}

Return ONLY valid JSON, no markdown fences.`,
      },
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content || "{}";
  try {
    const parsed = JSON.parse(content) as Partial<PapersComparison>;
    const validIds = new Set(papers.map((p) => p.id));
    const parsedPapers = Array.isArray(parsed.papers) ? parsed.papers : [];
    if (parsedPapers.length !== papers.length || !parsed.winnerId || !validIds.has(parsed.winnerId)) {
      throw new Error("Invalid comparison payload");
    }
    const winner = parsedPapers.find((p) => p.id === parsed.winnerId) ?? parsedPapers[0];
    return {
      papers: parsedPapers.map((p, i) => ({
        id: papers[i].id,
        title: papers[i].title,
        summary: p.summary || "Not stated in abstract.",
        existingSystem: p.existingSystem || "Not stated in abstract.",
        algorithm: p.algorithm || "Not stated in abstract.",
        methodology: p.methodology || "Not stated in abstract.",
        keyFindings: p.keyFindings || "Not stated in abstract.",
        limitations: p.limitations || "Not stated in abstract.",
        bestUseCase: p.bestUseCase || "Not stated in abstract.",
      })),
      comparisonTable: typeof parsed.comparisonTable === "string" ? parsed.comparisonTable : "",
      winnerId: parsed.winnerId,
      winnerTitle: winner.title || papers.find((p) => p.id === parsed.winnerId)?.title || "",
      winnerReasons: Array.isArray(parsed.winnerReasons) ? parsed.winnerReasons.slice(0, 8) : [],
      loserReasons:
        parsed.loserReasons && typeof parsed.loserReasons === "object" ? parsed.loserReasons : {},
      verdict: parsed.verdict || "",
      mode: "ai",
    };
  } catch {
    return fallbackComparison(papers, content.substring(0, 500));
  }
}