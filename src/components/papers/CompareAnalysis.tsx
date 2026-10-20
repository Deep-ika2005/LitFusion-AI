"use client";

import { useState } from "react";
import { Sparkles, Loader2, Trophy, CircleCheck, CircleX } from "lucide-react";

interface ComparedPaper {
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

interface PapersComparison {
  papers: ComparedPaper[];
  comparisonTable: string;
  winnerId: string;
  winnerTitle: string;
  winnerReasons: string[];
  loserReasons: Record<string, string[]>;
  verdict: string;
  mode?: "ai" | "basic";
  notice?: string;
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</h5>
      <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-700">{content}</p>
    </div>
  );
}

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** Parse a `| col | col |` markdown table into headers + rows (separator row skipped). */
function parseMarkdownTable(markdown: string): ParsedTable | null {
  const lines = (markdown || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  if (lines.length < 2) return null;
  const splitRow = (line: string): string[] =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());
  const isSeparatorRow = (cells: string[]): boolean =>
    cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell));
  const headers = splitRow(lines[0]);
  let bodyLines = lines.slice(1);
  if (bodyLines.length > 0 && isSeparatorRow(splitRow(bodyLines[0]))) {
    bodyLines = bodyLines.slice(1);
  }
  const rows = bodyLines
    .map(splitRow)
    .filter((cells) => !isSeparatorRow(cells) && cells.some((cell) => cell !== ""));
  if (headers.length === 0 || rows.length === 0) return null;
  return { headers, rows };
}

function isWinnerRow(firstCell: string, winnerTitle: string): boolean {
  const cell = (firstCell || "").toLowerCase().replace(/\s+/g, " ").trim();
  const winner = (winnerTitle || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!cell || !winner) return false;
  // Titles in the table may be truncated, so match on the leading 24 chars either way.
  return winner.includes(cell.slice(0, 24)) || cell.includes(winner.slice(0, 24));
}

function ComparisonTable({ markdown, winnerTitle }: { markdown: string; winnerTitle: string }) {
  const parsed = parseMarkdownTable(markdown);
  if (!parsed) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-gray-100 bg-gray-50/60 p-4 text-xs leading-relaxed text-gray-700">
        {markdown}
      </pre>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {parsed.headers.map((header, i) => (
              <th
                key={i}
                className={
                  i === 0
                    ? "sticky left-0 z-10 min-w-[12rem] border-b border-gray-200 bg-gray-50 p-3 text-left align-top text-xs font-semibold uppercase tracking-wide text-gray-500"
                    : "min-w-[10rem] border-b border-gray-200 bg-gray-50 p-3 text-left align-top text-xs font-semibold uppercase tracking-wide text-gray-500"
                }
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsed.rows.map((row, r) => {
            const winner = isWinnerRow(row[0] ?? "", winnerTitle);
            return (
              <tr key={r} className="group/row">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={
                      c === 0
                        ? `sticky left-0 z-10 border-b border-gray-100 bg-white p-3 align-top text-sm font-medium transition-colors group-hover/row:bg-gray-50 ${winner ? "text-emerald-700" : "text-gray-900"}`
                        : `border-b border-gray-100 p-3 align-top text-sm break-words transition-colors group-hover/row:bg-gray-50 ${winner ? "bg-emerald-50/60 text-gray-700" : "text-gray-700"}`
                    }
                  >
                    <span className="flex items-start gap-1.5">
                      {c === 0 && winner && <Trophy className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />}
                      <span className="break-words">{cell || "—"}</span>
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CompareAnalysis({ paperIds }: { paperIds: string[] }) {
  const [result, setResult] = useState<PapersComparison | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idsKey = paperIds.join(",");
  // A removed/added paper invalidates the previous verdict (synced during
  // render, no extra effect pass needed).
  const [syncedIdsKey, setSyncedIdsKey] = useState(idsKey);
  if (syncedIdsKey !== idsKey) {
    setSyncedIdsKey(idsKey);
    setResult(null);
    setError(null);
  }

  async function handleCompare() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/papers/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: paperIds }),
      });
      let data: unknown = null;
      try {
        data = (await res.json()) as unknown;
      } catch {
        throw new Error(`Comparison failed (HTTP ${res.status})`);
      }
      if (!res.ok) {
        const payload = (data ?? {}) as { error?: string; details?: string };
        const message = payload.error || `Comparison failed (HTTP ${res.status})`;
        const details = payload.details;
        throw new Error(details && !message.includes(details) ? `${message}: ${details}` : message);
      }
      setResult(data as PapersComparison);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setIsLoading(false);
    }
  }

  const canCompare = paperIds.length >= 2 && paperIds.length <= 5;

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary-600" />
          <h3 className="text-sm font-bold text-gray-900">AI Comparison — best paper and why</h3>
        </div>
        <button
          onClick={handleCompare}
          disabled={isLoading || !canCompare}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Comparing…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Compare with AI
            </>
          )}
        </button>
      </div>
      {!canCompare && (
        <p className="mt-2 text-xs text-gray-500">Select 2 to 5 papers to run the AI comparison.</p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-6">
          {result.mode === "basic" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs leading-relaxed text-blue-800">
                {result.notice || "Basic comparison (AI unavailable)."}
              </p>
            </div>
          )}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-1 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-600" />
              <h4 className="text-sm font-bold text-amber-900">Best paper: {result.winnerTitle}</h4>
            </div>
            <p className="whitespace-pre-line break-words text-sm leading-relaxed text-amber-800">{result.verdict}</p>
            {result.winnerReasons.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {result.winnerReasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                    <CircleCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                    <span className="break-words">{reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {result.papers.map((paper) => {
              const isWinner = paper.id === result.winnerId;
              const loserReasons = result.loserReasons[paper.id] ?? [];
              return (
                <article
                  key={paper.id}
                  className={`space-y-3 rounded-xl border p-4 ${isWinner ? "border-emerald-200 bg-emerald-50/50" : "border-gray-100 bg-gray-50/60"}`}
                >
                  <div className="flex items-start gap-2">
                    {isWinner ? (
                      <Trophy className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    ) : (
                      <CircleX className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                    )}
                    <h4 className="break-words text-sm font-semibold text-gray-900">{paper.title}</h4>
                  </div>
                  <Section title="Summary" content={paper.summary} />
                  <Section title="Existing system / problem" content={paper.existingSystem} />
                  <Section title="Algorithm" content={paper.algorithm} />
                  <Section title="Methodology" content={paper.methodology} />
                  <Section title="Key findings" content={paper.keyFindings} />
                  <Section title="Limitations" content={paper.limitations} />
                  <Section title="Best use case" content={paper.bestUseCase} />
                  {!isWinner && loserReasons.length > 0 && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <h5 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        Why this paper is not best
                      </h5>
                      <ul className="space-y-1.5">
                        {loserReasons.map((reason, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <CircleX className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                            <span className="break-words">{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {result.comparisonTable && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Side-by-side table
              </h4>
              <ComparisonTable markdown={result.comparisonTable} winnerTitle={result.winnerTitle} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
