"use client";

import React, { use, useState } from "react";
import {
  ExternalLink, FileText, ArrowLeft, Unlock, Lock, AlertTriangle, Sparkles, Loader2, ChevronDown, ChevronUp,
  Building2, CalendarDays, Hash, BookOpen, Library, ShieldCheck, ShieldQuestion, BadgeCheck,
} from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";

interface PaperData {
  id: string;
  openAlexId: string;
  title: string;
  abstract: string | null;
  authors: Array<{ id: string; name: string; orcid: string | null }>;
  publicationYear: number;
  publicationDate: string | null;
  doi: string | null;
  citedByCount: number;
  type: string;
  source: { displayName: string; type: string; issn?: string | null; issnL?: string | null; issnList?: string[] } | null;
  openAccess: { isOa: boolean; oaStatus: string | null };
  pdfUrl: string | null;
  landingPageUrl: string | null;
  topics: string[];
  keywords: string[];
  isRetracted: boolean;
  publisher?: { id: string | null; name: string | null; rawName: string | null; isVerified: boolean } | null;
  publicationStatus?: { status: string; label: string; isPublished: boolean; reason: string | null } | null;
  scopus?: { status: string; label: string; reason: string | null; evidence?: Array<{ detail: string }> } | null;
  sourcePlatform?: { name: string; host: string | null } | null;
}

interface Analysis {
  summary: string;
  methodology: string;
  keyFindings: string;
  limitations: string;
  futureWork: string;
}

function usePaper(id: string) {
  const [paper, setPaper] = React.useState<PaperData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) return;
    fetch(`/api/papers/${id}`)
      .then((res) => { if (!res.ok) throw new Error("Paper not found"); return res.json(); })
      .then(setPaper)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Paper not found"))
      .finally(() => setIsLoading(false));
  }, [id]);

  return { paper, isLoading, error };
}

function AnalysisSection({ title, content, defaultOpen = false }: { title: string; content: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-3"><p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{content}</p></div>}
    </div>
  );
}

export default function PaperDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { paper, isLoading, error } = usePaper(id);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  async function handleAnalyze() {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`/api/papers/${id}/summarize`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = (data as { error?: string } | null)?.error || "Analysis failed";
        const details = (data as { details?: string } | null)?.details;
        throw new Error(details && !message.includes(details) ? `${message}: ${details}` : message);
      }
      setAnalysis(await res.json());
    } catch (e: unknown) {
      setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gray-50/50">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-gray-50/50 px-4 text-center">
        <h2 className="mb-2 text-xl font-bold text-gray-900">Paper not found</h2>
        <p className="mb-4 text-gray-500">{error || "The paper could not be loaded."}</p>
        <Link href="/search" className="font-medium text-primary-600 transition-colors hover:text-primary-700">Back to Search</Link>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50/50">
      <PageContainer size="narrow" className="py-6 sm:py-8">
        <Link href="/search" className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to Search
        </Link>

        <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium capitalize text-blue-700">{paper.type?.replace(/-/g, " ")}</span>
            {paper.openAccess?.isOa ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"><Unlock className="h-3 w-3 flex-shrink-0" /> Open Access</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700"><Lock className="h-3 w-3 flex-shrink-0" /> Restricted</span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                paper.publicationStatus?.isPublished
                  ? "border-primary-200 bg-primary-100 text-primary-700"
                  : "border-gray-200 bg-gray-100 text-gray-600"
              }`}
              title={paper.publicationStatus?.reason ?? undefined}
            >
              {paper.publicationStatus?.isPublished ? <BadgeCheck className="h-3 w-3 flex-shrink-0" /> : <BookOpen className="h-3 w-3 flex-shrink-0" />}
              {paper.publicationStatus?.label ?? "Publication: Unknown"}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                paper.scopus?.status === "indexed"
                  ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                  : "border-gray-200 bg-gray-100 text-gray-500"
              }`}
              title={paper.scopus?.reason ?? paper.scopus?.evidence?.[0]?.detail}
            >
              {paper.scopus?.status === "indexed" ? <ShieldCheck className="h-3 w-3 flex-shrink-0" /> : <ShieldQuestion className="h-3 w-3 flex-shrink-0" />}
              Scopus: {paper.scopus?.label ?? "Unknown"}
            </span>
            {paper.isRetracted && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700"><AlertTriangle className="h-3 w-3 flex-shrink-0" /> Retracted</span>}
          </div>

          <h1 className="mb-4 break-words text-2xl font-bold leading-tight text-gray-900">{paper.title}</h1>
          <p className="mb-4 break-words text-sm text-gray-600">{paper.authors?.map((a) => a.name).join(", ")}</p>

          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            {paper.source && <span className="truncate">{paper.source.displayName}</span>}
            {paper.publicationYear > 0 && <span>{paper.publicationYear}</span>}
            {paper.citedByCount > 0 && <span className="font-medium">{paper.citedByCount.toLocaleString()} citations</span>}
          </div>

          <dl className="mb-8 grid grid-cols-1 gap-x-4 gap-y-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 text-gray-400" />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Publisher</dt>
                <dd className="text-sm text-gray-700">{paper.publisher?.name ?? paper.publisher?.rawName ?? "Unknown"}</dd></div>
            </div>
            <div className="flex items-start gap-2">
              <Library className="mt-0.5 h-4 w-4 text-gray-400" />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Journal / Conference</dt>
                <dd className="text-sm text-gray-700">{paper.source?.displayName ?? "Unknown"}</dd></div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 text-gray-400" />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Published</dt>
                <dd className="text-sm text-gray-700">{paper.publicationDate ?? (paper.publicationYear > 0 ? paper.publicationYear : "Unknown")}</dd></div>
            </div>
            <div className="flex items-start gap-2">
              <Hash className="mt-0.5 h-4 w-4 text-gray-400" />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">DOI</dt>
                <dd className="text-sm text-gray-700 break-all">{paper.doi ?? "Not available"}</dd></div>
            </div>
            <div className="flex items-start gap-2">
              <BadgeCheck className="mt-0.5 h-4 w-4 text-gray-400" />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Publication Status</dt>
                <dd className="text-sm text-gray-700">{paper.publicationStatus?.label ?? "Unknown"}</dd></div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-gray-400" />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Scopus Status</dt>
                <dd className="text-sm text-gray-700">{paper.scopus?.label ?? "Unknown"}</dd></div>
            </div>
            <div className="flex items-start gap-2">
              <Library className="mt-0.5 h-4 w-4 text-gray-400" />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Source</dt>
                <dd className="text-sm text-gray-700">{paper.sourcePlatform?.name ?? paper.source?.displayName ?? "Unknown"}</dd></div>
            </div>
            {(paper.source?.issnL || paper.source?.issn) && (
              <div className="flex items-start gap-2">
                <Hash className="mt-0.5 h-4 w-4 text-gray-400" />
                <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">ISSN</dt>
                  <dd className="text-sm text-gray-700" title={paper.source?.issnList && paper.source.issnList.length > 1 ? `All ISSNs: ${paper.source.issnList.join(", ")}` : undefined}>{paper.source.issnL || paper.source.issn}</dd></div>
              </div>
            )}
            {paper.source?.issnList && paper.source.issnList.length > 1 && (
              <div className="flex items-start gap-2">
                <Hash className="mt-0.5 h-4 w-4 text-gray-400" />
                <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">All ISSNs</dt>
                  <dd className="text-sm text-gray-700 break-all">{paper.source.issnList.join(", ")}</dd></div>
              </div>
            )}
          </dl>

          {(paper.scopus?.reason || paper.publicationStatus?.reason) && (
            <div className="mb-6 rounded-lg border border-gray-100 bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Verification notes</h3>
              {paper.publicationStatus?.reason && (
                <p className="text-xs text-gray-600 mb-1">Publication: {paper.publicationStatus.reason}</p>
              )}
              {paper.scopus?.reason && (
                <p className="text-xs text-gray-600">Scopus: {paper.scopus.reason}</p>
              )}
            </div>
          )}

          <div className="mb-8 flex flex-wrap items-center gap-3">
            {paper.landingPageUrl && (
              <a href={paper.landingPageUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-600 px-5 text-sm font-medium text-white transition-colors hover:bg-primary-700">
                <ExternalLink className="h-4 w-4 flex-shrink-0" /> View Paper
              </a>
            )}
            {paper.pdfUrl ? (
              <a href={paper.pdfUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                <FileText className="h-4 w-4 flex-shrink-0" /> View PDF
              </a>
            ) : (
              <span className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-5 text-sm font-medium text-gray-400">
                <FileText className="h-4 w-4 flex-shrink-0" /> PDF unavailable
              </span>
            )}
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !paper.abstract}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzing ? (
                <><Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" /> Analyzing...</>
              ) : (
                <><Sparkles className="h-4 w-4 flex-shrink-0" /> Analyze with AI</>
              )}
            </button>
          </div>

          {paper.doi && (
            <div className="mb-6">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">DOI</h3>
              <a
                href={paper.doi.startsWith("http") ? paper.doi : `https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-sm text-primary-600 transition-colors hover:text-primary-700"
              >
                {paper.doi}
              </a>
            </div>
          )}

          {paper.abstract && (
            <div className="mb-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Abstract</h3>
              <p className="break-words whitespace-pre-line text-sm leading-relaxed text-gray-700">{paper.abstract}</p>
            </div>
          )}

          {analysis && (
            <div className="mb-6 rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50 to-blue-50 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary-600" />
                <h3 className="text-sm font-bold text-primary-900">AI Analysis</h3>
              </div>
              <div className="space-y-2">
                <AnalysisSection title="Summary" content={analysis.summary} defaultOpen={true} />
                <AnalysisSection title="Methodology" content={analysis.methodology} />
                <AnalysisSection title="Key Findings" content={analysis.keyFindings} />
                <AnalysisSection title="Limitations" content={analysis.limitations} />
                <AnalysisSection title="Future Work" content={analysis.futureWork} />
              </div>
            </div>
          )}

          {analysisError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-600">{analysisError}</p>
            </div>
          )}

          {paper.topics?.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Topics</h3>
              <div className="flex flex-wrap gap-2">{paper.topics.map((topic: string, i: number) => <span key={i} className="max-w-full break-words rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">{topic}</span>)}</div>
            </div>
          )}

          {paper.keywords?.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Keywords</h3>
              <div className="flex flex-wrap gap-2">{paper.keywords.map((kw: string, i: number) => <span key={i} className="max-w-full break-words rounded-md bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">{kw}</span>)}</div>
            </div>
          )}
        </article>
      </PageContainer>
    </div>
  );
}