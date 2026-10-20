"use client";

import { useState } from "react";
import { clsx } from "clsx";
import {
  ExternalLink, FileText, Bookmark, GitCompare, ChevronDown, ChevronUp, Lock, Unlock, AlertTriangle,
  BadgeCheck, ShieldCheck, ShieldQuestion, Building2, CalendarDays, Hash, BookOpen, Library,
} from "lucide-react";
import { checkboxControlClass } from "@/components/ui/controls";
import type { Paper, PublicationStatusResult, QuartileResult, ScopusResult } from "@/types";
import { truncateAbstract } from "@/lib/abstract";

interface PaperCardProps {
  paper: Paper;
  onSave?: (paper: Paper) => void;
  isSaved?: boolean;
  onCompare?: (paper: Paper) => void;
  isSelected?: boolean;
  onToggleSelect?: (paper: Paper) => void;
  className?: string;
}

function getTypeBadge(type: string) {
  const map: Record<string, { label: string; color: string }> = {
    article: { label: "Journal", color: "bg-blue-100 text-blue-700" },
    "proceedings-article": { label: "Conference", color: "bg-purple-100 text-purple-700" },
    book: { label: "Book", color: "bg-amber-100 text-amber-700" },
    "book-chapter": { label: "Book Chapter", color: "bg-amber-100 text-amber-700" },
    preprint: { label: "Preprint", color: "bg-orange-100 text-orange-700" },
    dissertation: { label: "Thesis", color: "bg-teal-100 text-teal-700" },
    dataset: { label: "Dataset", color: "bg-cyan-100 text-cyan-700" },
  };
  return map[type] || { label: type, color: "bg-gray-100 text-gray-700" };
}

function getPublicationBadge(status: PublicationStatusResult | null | undefined) {
  if (!status) {
    return { label: "Publication: Unknown", className: "bg-gray-100 text-gray-600", icon: BookOpen };
  }
  switch (status.status) {
    case "published":
      return { label: "Published", className: "bg-primary-100 text-primary-700", icon: BadgeCheck };
    case "preprint":
      return { label: "Preprint", className: "bg-orange-100 text-orange-700", icon: FileText };
    case "accepted":
      return { label: "Accepted Manuscript", className: "bg-sky-100 text-sky-700", icon: BadgeCheck };
    case "submitted":
      return { label: "Submitted", className: "bg-amber-100 text-amber-700", icon: FileText };
    case "record-only":
      return { label: "Record Only", className: "bg-gray-100 text-gray-600", icon: Library };
    case "unpublished":
      return { label: "Unpublished", className: "bg-gray-200 text-gray-700", icon: FileText };
    default:
      return { label: "Publication: Unknown", className: "bg-gray-100 text-gray-600", icon: ShieldQuestion };
  }
}

function getScopusBadge(scopus: ScopusResult | null | undefined) {
  if (!scopus || scopus.status === "unknown") {
    return { label: "Scopus: Unknown", className: "bg-gray-100 text-gray-500 border-gray-200", icon: ShieldQuestion };
  }
  if (scopus.status === "indexed") {
    return { label: "Scopus Indexed", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: ShieldCheck };
  }
  return { label: "Scopus: Not Indexed", className: "bg-gray-100 text-gray-600 border-gray-200", icon: ShieldQuestion };
}

function getQuartileBadge(quartile: QuartileResult | null | undefined) {
  if (!quartile || !quartile.quartile) {
    return { label: "Quartile unavailable", className: "bg-gray-100 text-gray-500 border-gray-200" };
  }
  switch (quartile.quartile) {
    case "Q1":
      return { label: "Q1", className: "bg-indigo-100 text-indigo-700 border-indigo-200" };
    case "Q2":
      return { label: "Q2", className: "bg-sky-100 text-sky-700 border-sky-200" };
    case "Q3":
      return { label: "Q3", className: "bg-amber-100 text-amber-700 border-amber-200" };
    case "Q4":
      return { label: "Q4", className: "bg-slate-200 text-slate-700 border-slate-300" };
    default:
      return { label: "Quartile unavailable", className: "bg-gray-100 text-gray-500 border-gray-200" };
  }
}

function formatCitations(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

function formatDate(value: string | null, year: number): string {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }
  }
  if (year > 0) return String(year);
  return "Unknown";
}

function MetadataRow({ icon: Icon, label, value, title }: {
  icon: typeof Building2;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex items-start gap-2" title={title}>
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
      <div className="min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
        <p className="truncate text-sm text-gray-700">{value}</p>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-[11px] font-medium text-gray-400">{label}</span>
        <span className="text-[11px] text-gray-400">n/a</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] font-medium text-gray-500">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-gray-600">{value.toFixed(1)}</span>
    </div>
  );
}

export function PaperCard({ paper, onSave, isSaved, onCompare, isSelected, onToggleSelect, className }: PaperCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const typeBadge = getTypeBadge(paper.type);
  const publicationBadge = getPublicationBadge(paper.publicationStatus);
  const scopusBadge = getScopusBadge(paper.scopus);
  const quartileBadge = getQuartileBadge(paper.quartile);
  const quartileTooltip = paper.quartile?.quartile
    ? [
        `Verified quartile ${paper.quartile.quartile}`,
        paper.quartile.category ? `Category: ${paper.quartile.category}` : null,
        paper.quartile.year ? `Year: ${paper.quartile.year}` : null,
        paper.quartile.provenance ? `Source: ${paper.quartile.provenance}` : null,
      ].filter(Boolean).join(" · ")
    : (paper.quartile?.reason ?? "No verified quartile found for this journal's ISSN.");

  const getAccessInfo = () => {
    if (paper.openAccess.isOa) {
      return { label: "Open Access", icon: Unlock, color: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    }
    return { label: "Restricted", icon: Lock, color: "bg-amber-100 text-amber-700 border-amber-200" };
  };

  const accessInfo = getAccessInfo();

  const venue = paper.source?.displayName || "Unknown venue";
  const publisherLabel = paper.publisher?.name || paper.publisher?.rawName || "Unknown";
  const publisherVerified = paper.publisher?.isVerified === true;
  const sourceLabel = paper.sourcePlatform?.name || paper.source?.displayName || "Unknown source";
  const issnDisplay = paper.source?.issnL || paper.source?.issn || paper.source?.issnList?.[0] || null;
  const issnTooltip = paper.source?.issnList && paper.source.issnList.length > 1
    ? `All ISSNs: ${paper.source.issnList.join(", ")}`
    : undefined;
  const authorsLabel = paper.authors.length > 0
    ? paper.authors.map((a) => a.name).join(", ")
    : "Unknown authors";

  return (
    <div
      className={clsx(
        "animate-fadeIn rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md",
        isSelected ? "border-primary-500 ring-2 ring-primary-100" : "border-gray-200",
        className
      )}
    >
      <div className="flex items-start gap-4">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(paper)}
            aria-label={`Select ${paper.title} for comparison`}
            className={clsx(checkboxControlClass, "mt-1 h-4 w-4 flex-shrink-0")}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadge.color}`}>
              {typeBadge.label}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${accessInfo.color}`}>
              <accessInfo.icon className="h-3 w-3 flex-shrink-0" />
              {accessInfo.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${publicationBadge.className}`}
              title={paper.publicationStatus?.reason ?? undefined}
            >
              <publicationBadge.icon className="h-3 w-3 flex-shrink-0" />
              {publicationBadge.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${scopusBadge.className}`}
              title={paper.scopus?.reason ?? paper.scopus?.evidence?.[0]?.detail}
            >
              <scopusBadge.icon className="h-3 w-3 flex-shrink-0" />
              {scopusBadge.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${quartileBadge.className}`}
              title={quartileTooltip}
            >
              {quartileBadge.label}
            </span>
            {publisherLabel !== "Unknown" && (
              <span
                className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  publisherVerified
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-gray-50 text-gray-500"
                }`}
                title={paper.publisher?.rawName ? `Publisher metadata: ${paper.publisher.rawName}` : undefined}
              >
                <Building2 className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{publisherLabel}</span>
              </span>
            )}
            {paper.isRetracted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                Retracted
              </span>
            )}
          </div>

          <h3 className="mb-1.5 line-clamp-2 break-words text-base font-semibold leading-snug text-gray-900">
            {paper.landingPageUrl ? (
              <a href={paper.landingPageUrl} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary-600">
                {paper.title}
              </a>
            ) : (
              paper.title
            )}
          </h3>

          <p className="mb-2 break-words text-sm text-gray-500">
            {paper.authors.slice(0, 3).map((a) => a.name).join(", ")}
            {paper.authors.length > 3 && ` et al. (${paper.authors.length} authors)`}
          </p>

          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
            {paper.source && <span className="truncate">{paper.source.displayName}</span>}
            {paper.publicationYear > 0 && <span>{paper.publicationYear}</span>}
            {paper.citedByCount > 0 && (
              <span className="font-medium text-gray-500">{formatCitations(paper.citedByCount)} citations</span>
            )}
          </div>

          <div className="mb-3 grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3 sm:grid-cols-2">
            <MetadataRow icon={BookOpen} label="Authors" value={authorsLabel} title={authorsLabel} />
            <MetadataRow
              icon={Building2}
              label="Publisher"
              value={publisherLabel}
              title={paper.publisher?.rawName ?? "No publisher metadata available"}
            />
            <MetadataRow icon={Library} label="Journal / Conference" value={venue} title={venue} />
            <MetadataRow
              icon={CalendarDays}
              label="Published"
              value={formatDate(paper.publicationDate, paper.publicationYear)}
            />
            <MetadataRow
              icon={Hash}
              label="DOI"
              value={paper.doi || "Not available"}
              title={paper.doi || undefined}
            />
            <MetadataRow
              icon={publicationBadge.icon}
              label="Publication Status"
              value={paper.publicationStatus?.label ?? "Unknown"}
              title={paper.publicationStatus?.reason ?? undefined}
            />
            <MetadataRow
              icon={scopusBadge.icon}
              label="Scopus Status"
              value={paper.scopus?.label ?? "Unknown"}
              title={paper.scopus?.reason ?? paper.scopus?.evidence?.[0]?.detail}
            />
            <MetadataRow
              icon={Library}
              label="Source"
              value={sourceLabel}
              title={paper.sourcePlatform?.host ?? undefined}
            />
            {issnDisplay && (
              <MetadataRow
                icon={Hash}
                label="ISSN"
                value={issnDisplay}
                title={issnTooltip}
              />
            )}
            <MetadataRow
              icon={Library}
              label="Journal Quartile"
              value={
                paper.quartile?.quartile
                  ? `${paper.quartile.quartile}${paper.quartile.category ? ` · ${paper.quartile.category}` : ""}${paper.quartile.year ? ` · ${paper.quartile.year}` : ""}`
                  : "Quartile unavailable"
              }
              title={quartileTooltip}
            />
          </div>

          {paper.ranking && (
            <div className="mb-3 rounded-lg border border-gray-100 bg-white p-3">
              <button
                onClick={() => setScoreOpen(!scoreOpen)}
                aria-expanded={scoreOpen}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="text-xs font-semibold text-gray-700">
                  Ranking score{" "}
                  <span className="ml-1 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold tabular-nums text-primary-700">
                    {paper.ranking.final.toFixed(1)}
                  </span>
                </span>
                {scoreOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
              </button>
              {scoreOpen && (
                <div className="mt-2 space-y-1.5">
                  <ScoreBar label="Relevance 40%" value={paper.ranking.relevance} />
                  <ScoreBar label="Quartile 30%" value={paper.ranking.quartile} />
                  <ScoreBar label="Recency 20%" value={paper.ranking.recency} />
                  <ScoreBar label="Citations 10%" value={paper.ranking.citations} />
                  <p className="break-words pt-1 font-mono text-[11px] leading-relaxed text-gray-500" title={paper.ranking.formula}>
                    {paper.ranking.formula}
                  </p>
                  {paper.ranking.missing.length > 0 && (
                    <p className="text-[11px] leading-relaxed text-gray-400">
                      Skipped (no verified value): {paper.ranking.missing.join(", ")}. Weights renormalized over present components.
                    </p>
                  )}
                  <p className="text-[11px] leading-relaxed text-gray-400">
                    Journal quartile describes the venue, not this paper&apos;s quality.
                  </p>
                </div>
              )}
            </div>
          )}

          {paper.abstract && (
            <div className="mb-3">
              <p className="break-words text-sm leading-relaxed text-gray-600">
                {expanded ? paper.abstract : truncateAbstract(paper.abstract, 200)}
              </p>
              {paper.abstract.length > 200 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
                >
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {expanded ? "Show less" : "Read more"}
                </button>
              )}
            </div>
          )}

          {paper.topics.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {paper.topics.slice(0, 4).map((topic, i) => (
                <span key={i} className="inline-flex max-w-full items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  <span className="truncate">{topic}</span>
                </span>
              ))}
              {paper.keywords.slice(0, 3).map((kw, i) => (
                <span key={`kw-${i}`} className="inline-flex max-w-full items-center rounded-md bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                  <span className="truncate">{kw}</span>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {paper.landingPageUrl && (
              <a
                href={paper.landingPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-xs font-medium text-white transition-colors hover:bg-primary-700"
              >
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                View Paper
              </a>
            )}
            {paper.pdfUrl ? (
              <a
                href={paper.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                View PDF
              </a>
            ) : (
              <span className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 text-xs font-medium text-gray-400">
                <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                PDF unavailable
              </span>
            )}
            {onSave && (
              <button
                onClick={() => onSave(paper)}
                aria-pressed={isSaved === true}
                title={isSaved ? "Remove from library" : "Save to library"}
                className={clsx(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
                  isSaved
                    ? "border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                )}
              >
                <Bookmark className={clsx("h-3.5 w-3.5 flex-shrink-0", isSaved && "fill-current")} />
                {isSaved ? "Saved" : "Save"}
              </button>
            )}
            {onCompare && (
              <button
                onClick={() => onCompare(paper)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <GitCompare className="h-3.5 w-3.5 flex-shrink-0" />
                Compare
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
