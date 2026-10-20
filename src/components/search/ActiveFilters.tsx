"use client";

import { FilterChip } from "@/components/filters/FilterSection";
import { X } from "lucide-react";
import { getPublisherLabel } from "@/lib/verification/publisher";

interface ActiveFiltersProps {
  types: string[];
  accessType: string;
  yearFrom: number | null;
  yearTo: number | null;
  minCitations: number | null;
  publisher: string;
  publisherQuery?: string;
  scopusOnly: boolean;
  publishedOnly: boolean;
  quartiles: string[];
  onRemoveType: (type: string) => void;
  onRemoveAccess: () => void;
  onRemoveYear: () => void;
  onRemoveCitations: () => void;
  onRemovePublisher: () => void;
  onRemoveScopus: () => void;
  onRemovePublished: () => void;
  onRemoveQuartile: (quartile: string) => void;
  onClearAll: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  article: "Journal", "proceedings-article": "Conference", preprint: "Preprint",
  book: "Book", "book-chapter": "Book Chapter", dissertation: "Thesis", dataset: "Dataset",
};

export function ActiveFilters({
  types, accessType, yearFrom, yearTo, minCitations, publisher, publisherQuery = "", scopusOnly, publishedOnly,
  quartiles,
  onRemoveType, onRemoveAccess, onRemoveYear, onRemoveCitations,
  onRemovePublisher, onRemoveScopus, onRemovePublished, onRemoveQuartile, onClearAll,
}: ActiveFiltersProps) {
  const chips: { label: string; onRemove: () => void }[] = [];

  types.forEach((type) => chips.push({ label: TYPE_LABELS[type] || type, onRemove: () => onRemoveType(type) }));
  if (accessType !== "all") chips.push({ label: accessType === "open" ? "Open Access" : "Restricted", onRemove: onRemoveAccess });
  if (yearFrom || yearTo) {
    const label = yearFrom && yearTo ? `${yearFrom}-${yearTo}` : yearFrom ? `From ${yearFrom}` : `Until ${yearTo}`;
    chips.push({ label, onRemove: onRemoveYear });
  }
  if (minCitations) chips.push({ label: `${minCitations}+ citations`, onRemove: onRemoveCitations });
  if (publisher && publisher !== "all") {
    chips.push({ label: getPublisherLabel(publisher, publisherQuery), onRemove: onRemovePublisher });
  }
  if (publishedOnly) chips.push({ label: "Published only", onRemove: onRemovePublished });
  if (scopusOnly) chips.push({ label: "Scopus indexed only", onRemove: onRemoveScopus });
  quartiles.forEach((q) =>
    chips.push({ label: q === "unranked" ? "Unranked" : q, onRemove: () => onRemoveQuartile(q) })
  );

  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((chip, i) => (
        <FilterChip key={i} label={chip.label} onRemove={chip.onRemove} />
      ))}
      {chips.length > 1 && (
        <button
          onClick={onClearAll}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
        >
          <X className="h-3 w-3" />
          Clear All
        </button>
      )}
    </div>
  );
}
