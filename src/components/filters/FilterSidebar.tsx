"use client";

import { useState, useMemo } from "react";
import { clsx } from "clsx";
import { FilterSection } from "./FilterSection";
import { RotateCcw, ShieldCheck, BookCheck, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { checkboxControlClass } from "@/components/ui/controls";
import type { SearchFacets, ScopusStatus } from "@/types";
import { getPublisherOptions, OTHER_PUBLISHER_ID, OTHER_PUBLISHER_LABEL } from "@/lib/verification/publisher";

interface FilterSidebarProps {
  facets: SearchFacets;
  selectedTypes: string[];
  selectedAccess: string;
  selectedYearFrom: number | null;
  selectedYearTo: number | null;
  selectedMinCitations: number | null;
  selectedPublisher: string;
  selectedPublisherQuery?: string;
  scopusOnly: boolean;
  publishedOnly: boolean;
  selectedQuartiles: string[];
  onTypeChange: (types: string[]) => void;
  onAccessChange: (access: string) => void;
  onYearChange: (from: number | null, to: number | null) => void;
  onCitationChange: (min: number | null) => void;
  onPublisherChange: (publisher: string, publisherQuery?: string) => void;
  onScopusOnlyChange: (enabled: boolean) => void;
  onPublishedOnlyChange: (enabled: boolean) => void;
  onQuartileChange: (quartiles: string[]) => void;
  onClearAll: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  article: "Journal Article",
  "proceedings-article": "Conference Paper",
  preprint: "Preprint",
  book: "Book",
  "book-chapter": "Book Chapter",
  dissertation: "Thesis/Dissertation",
  dataset: "Dataset",
  other: "Other",
};

const QUICK_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020];

const CITATION_RANGES = [
  { label: "Any", value: null },
  { label: "10+", value: 10 },
  { label: "50+", value: 50 },
  { label: "100+", value: 100 },
  { label: "500+", value: 500 },
  { label: "1000+", value: 1000 },
];

const PUBLISHERS = getPublisherOptions();

const PUBLICATION_STATUS_LABELS: Record<string, string> = {
  published: "Published",
  preprint: "Preprint",
  accepted: "Accepted manuscript",
  submitted: "Submitted",
  "record-only": "Record only",
  unpublished: "Unpublished",
  unknown: "Unknown",
};

const SCOPUS_LABELS: Record<ScopusStatus, string> = {
  indexed: "Scopus Indexed",
  "not-indexed": "Not in Scopus",
  unknown: "Scopus Unknown",
};

const QUARTILE_LABELS: Record<string, string> = {
  Q1: "Q1 — Top quartile",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
  unranked: "Unranked (quartile unavailable)",
};

export function FilterSidebar({
  facets,
  selectedTypes,
  selectedAccess,
  selectedYearFrom,
  selectedYearTo,
  selectedMinCitations,
  selectedPublisher,
  selectedPublisherQuery = "",
  scopusOnly,
  publishedOnly,
  selectedQuartiles,
  onTypeChange,
  onAccessChange,
  onYearChange,
  onCitationChange,
  onPublisherChange,
  onScopusOnlyChange,
  onPublishedOnlyChange,
  onQuartileChange,
  onClearAll,
}: FilterSidebarProps) {
  const [customYearFrom, setCustomYearFrom] = useState(selectedYearFrom?.toString() || "");
  const [customYearTo, setCustomYearTo] = useState(selectedYearTo?.toString() || "");
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [customPublisher, setCustomPublisher] = useState(selectedPublisherQuery);
  const [syncedPublisherQuery, setSyncedPublisherQuery] = useState(selectedPublisherQuery);
  if (syncedPublisherQuery !== selectedPublisherQuery) {
    setSyncedPublisherQuery(selectedPublisherQuery);
    setCustomPublisher(selectedPublisherQuery);
  }

  const sortedTypes = useMemo(() => {
    return Object.entries(facets.typeCounts)
      .sort(([, a], [, b]) => b - a);
  }, [facets.typeCounts]);

  const visibleTypes = showAllTypes ? sortedTypes : sortedTypes.slice(0, 5);

  const publisherCounts = facets.publisherCounts ?? {};
  const scopusCounts = facets.scopusCounts ?? { indexed: 0, "not-indexed": 0, unknown: 0 };
  const statusCounts = facets.publicationStatusCounts ?? {};
  const quartileCounts = facets.quartileCounts ?? { Q1: 0, Q2: 0, Q3: 0, Q4: 0, unranked: 0 };

  const handleQuartileToggle = (tier: string) => {
    if (selectedQuartiles.includes(tier)) {
      onQuartileChange(selectedQuartiles.filter((q) => q !== tier));
    } else {
      onQuartileChange([...selectedQuartiles, tier]);
    }
  };

  const handleTypeToggle = (type: string) => {
    if (selectedTypes.includes(type)) {
      onTypeChange(selectedTypes.filter((t) => t !== type));
    } else {
      onTypeChange([...selectedTypes, type]);
    }
  };

  const handleYearQuickSelect = (year: number) => {
    if (selectedYearFrom === year && selectedYearTo === year) {
      onYearChange(null, null);
    } else {
      onYearChange(year, year);
    }
  };

  const handleCustomYearApply = () => {
    const from = customYearFrom ? parseInt(customYearFrom, 10) : null;
    const to = customYearTo ? parseInt(customYearTo, 10) : null;
    onYearChange(from, to);
  };

  const hasActiveFilters =
    selectedTypes.length > 0 ||
    selectedAccess !== "all" ||
    selectedYearFrom ||
    selectedYearTo ||
    selectedMinCitations ||
    selectedPublisher !== "all" ||
    (selectedPublisherQuery?.trim() ?? "") !== "" ||
    scopusOnly ||
    publishedOnly ||
    selectedQuartiles.length > 0;

  return (
    <div className="w-full min-w-0 lg:sticky lg:top-[var(--sticky-panel-offset)] lg:self-start">
      <button
        type="button"
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-expanded={mobileOpen}
        className="mb-3 flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 lg:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary-600" />
          Filters
          {hasActiveFilters && <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">Active</span>}
        </span>
        {mobileOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      <div
        className={clsx(
          "filter-scroll rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6",
          "max-h-[70vh] overflow-y-auto lg:max-h-[calc(100vh-var(--sticky-panel-offset)-2rem)]",
          mobileOpen ? "block" : "hidden lg:block"
        )}
      >
        <div className="mb-5 hidden items-center justify-between gap-2 lg:flex">
          <h3 className="text-sm font-bold text-gray-900">Filters</h3>
          {hasActiveFilters && (
            <button
              onClick={onClearAll}
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              <RotateCcw className="h-3 w-3" />
              Clear All
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <button
            onClick={onClearAll}
            className="mb-5 inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700 lg:hidden"
          >
            <RotateCcw className="h-3 w-3" />
            Clear All
          </button>
        )}

        <FilterSection title="Publisher">
          <div className="space-y-1">
            <button
              onClick={() => onPublisherChange("all")}
              className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                selectedPublisher === "all" ? "bg-primary-100 text-primary-700 font-medium" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span>All Publishers</span>
            </button>
            {PUBLISHERS.map((publisher) => (
              <button
                key={publisher.id}
                onClick={() => onPublisherChange(publisher.id)}
                className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  selectedPublisher === publisher.id ? "bg-primary-100 text-primary-700 font-medium" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{publisher.name}</span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-400">{publisherCounts[publisher.id] || 0}</span>
              </button>
            ))}
            <button
              onClick={() => onPublisherChange(OTHER_PUBLISHER_ID)}
              className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                selectedPublisher === OTHER_PUBLISHER_ID ? "bg-primary-100 text-primary-700 font-medium" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{OTHER_PUBLISHER_LABEL}</span>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-400">{publisherCounts[OTHER_PUBLISHER_ID] || 0}</span>
            </button>
            {selectedPublisher === OTHER_PUBLISHER_ID && (
              <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-2">
                <input
                  type="text"
                  value={customPublisher}
                  onChange={(e) => setCustomPublisher(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onPublisherChange(OTHER_PUBLISHER_ID, customPublisher.trim());
                    }
                  }}
                  placeholder="Type publisher: Nature, SAGE…"
                  aria-label="Custom publisher name"
                  className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => onPublisherChange(OTHER_PUBLISHER_ID, customPublisher.trim())}
                    disabled={!customPublisher.trim()}
                    className="h-8 flex-1 rounded-lg bg-primary-600 px-3 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Search
                  </button>
                  {selectedPublisherQuery.trim() !== "" && (
                    <button
                      onClick={() => {
                        setCustomPublisher("");
                        onPublisherChange(OTHER_PUBLISHER_ID, "");
                      }}
                      className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </FilterSection>

        <FilterSection title="Scopus Indexing">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50">
            <input
              type="checkbox"
              checked={scopusOnly}
              onChange={(e) => onScopusOnlyChange(e.target.checked)}
              className={clsx(checkboxControlClass, "mt-0.5 text-emerald-600 focus:ring-emerald-500")}
            />
            <span className="flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Scopus Indexed Only
              </span>
              <span className="mt-0.5 block text-xs text-gray-400">
                Only papers whose Scopus coverage is verified. Unverified papers (Scopus: Unknown) are hidden.
              </span>
            </span>
          </label>
          <div className="mt-3 space-y-1">
            {(Object.keys(SCOPUS_LABELS) as ScopusStatus[]).map((status) => (
              <div key={status} className="flex items-center gap-2 px-1 text-xs">
                <span className={`min-w-0 flex-1 truncate ${status === "indexed" ? "text-emerald-600" : status === "not-indexed" ? "text-gray-500" : "text-gray-400"}`}>
                  {SCOPUS_LABELS[status]}
                </span>
                <span className="w-10 shrink-0 text-right font-medium tabular-nums text-gray-600">{scopusCounts[status] || 0}</span>
              </div>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Publication Status">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50">
            <input
              type="checkbox"
              checked={publishedOnly}
              onChange={(e) => onPublishedOnlyChange(e.target.checked)}
              className={clsx(checkboxControlClass, "mt-0.5")}
            />
            <span className="flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <BookCheck className="h-3.5 w-3.5 text-primary-600" />
                Published Papers Only
              </span>
              <span className="mt-0.5 block text-xs text-gray-400">
                Excludes preprints, drafts, submitted papers and records without a published version.
              </span>
            </span>
          </label>
          <div className="mt-3 space-y-1">
            {Object.entries(statusCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([status, count]) => (
                <div key={status} className="flex items-center gap-2 px-1 text-xs">
                  <span className={`min-w-0 flex-1 truncate ${status === "published" ? "text-primary-600" : "text-gray-500"}`}>
                    {PUBLICATION_STATUS_LABELS[status] || status}
                  </span>
                  <span className="w-10 shrink-0 text-right font-medium tabular-nums text-gray-600">{count}</span>
                </div>
              ))}
          </div>
        </FilterSection>

        <FilterSection title="Journal Quartile">
          <div className="space-y-1">
            {(Object.keys(QUARTILE_LABELS) as string[]).map((tier) => (
              <label key={tier} className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedQuartiles.includes(tier)}
                  onChange={() => handleQuartileToggle(tier)}
                  className={checkboxControlClass}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{QUARTILE_LABELS[tier]}</span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-400">{quartileCounts[tier as keyof typeof quartileCounts] || 0}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-gray-400">
            Verified ISSN-based quartiles only. Unranked papers stay visible unless filtered out.
          </p>
        </FilterSection>

        <FilterSection title="Paper Type">
          <div className="space-y-1">
            {visibleTypes.map(([type, count]) => (
              <label key={type} className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type)}
                  onChange={() => handleTypeToggle(type)}
                  className={checkboxControlClass}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{TYPE_LABELS[type] || type}</span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-400">{count}</span>
              </label>
            ))}
          </div>
          {sortedTypes.length > 5 && (
            <button
              onClick={() => setShowAllTypes(!showAllTypes)}
              className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              {showAllTypes ? "Show less" : `Show all (${sortedTypes.length})`}
            </button>
          )}
        </FilterSection>

        <FilterSection title="Access Type">
          <div className="space-y-1">
            {[
              { label: "All Papers", value: "all", count: facets.accessCounts.open + facets.accessCounts.restricted },
              { label: "Open Access", value: "open", count: facets.accessCounts.open },
              { label: "Restricted", value: "restricted", count: facets.accessCounts.restricted },
            ].map((item) => (
              <label key={item.value} className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50">
                <input
                  type="radio"
                  name="accessType"
                  checked={selectedAccess === item.value}
                  onChange={() => onAccessChange(item.value)}
                  className="h-3.5 w-3.5 flex-shrink-0 border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{item.label}</span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-400">{item.count}</span>
              </label>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Publication Year">
          <div className="space-y-1">
            {QUICK_YEARS.map((year) => (
              <button
                key={year}
                onClick={() => handleYearQuickSelect(year)}
                className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  selectedYearFrom === year && selectedYearTo === year
                    ? "bg-primary-100 text-primary-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="min-w-0 flex-1 text-left">{year}</span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-400">{facets.yearCounts[year] || 0}</span>
              </button>
            ))}
            <button
              onClick={() => {
                const lastYear = QUICK_YEARS[QUICK_YEARS.length - 1];
                if (selectedYearTo === lastYear && !selectedYearFrom) {
                  onYearChange(null, null);
                } else {
                  onYearChange(null, lastYear);
                }
              }}
              className={`flex min-h-9 w-full items-center rounded-lg px-3 py-1.5 text-sm transition-colors ${
                selectedYearTo && !selectedYearFrom
                  ? "bg-primary-100 text-primary-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Before {QUICK_YEARS[QUICK_YEARS.length - 1]}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              placeholder="From"
              aria-label="Year from"
              value={customYearFrom}
              onChange={(e) => setCustomYearFrom(e.target.value)}
              className="h-9 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <span className="flex-shrink-0 text-gray-400">-</span>
            <input
              type="number"
              placeholder="To"
              aria-label="Year to"
              value={customYearTo}
              onChange={(e) => setCustomYearTo(e.target.value)}
              className="h-9 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <button
            onClick={handleCustomYearApply}
            className="mt-2 h-9 w-full rounded-lg bg-primary-600 px-3 text-xs font-medium text-white transition-colors hover:bg-primary-700"
          >
            Apply Year Range
          </button>
        </FilterSection>

        <FilterSection title="Citations" defaultOpen={false}>
          <div className="space-y-1">
            {CITATION_RANGES.map((range) => (
              <button
                key={range.label}
                onClick={() => onCitationChange(range.value)}
                className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  selectedMinCitations === range.value
                    ? "bg-primary-100 text-primary-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span>{range.label} citations</span>
              </button>
            ))}
          </div>
        </FilterSection>
      </div>
    </div>
  );
}
